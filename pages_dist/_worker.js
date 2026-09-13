// 留言板 API：Cloudflare Pages Function（_worker.js 高级模式）
//
// 部署形态：独立 Pages 项目（guestbook-9z8.pages.dev），仅承载 API；
// 主站仍在 GitHub Pages（hconzlvra.top），前端跨域调用本 API（CORS 白名单）。
//
// 路由：
//   GET    /api/messages?page=1&size=20   分页拉取顶层留言（replies 字段挂好嵌套回复树）
//   POST   /api/messages                  提交留言/回复（body.parent_id 可选；同 IP 每分钟最多 3 条）
//   DELETE /api/messages/:id              删除留言及其全部子孙回复（需 Authorization: Bearer <ADMIN_KEY>）
//   POST   /api/visit                     访客上报（sendBeacon 空 body；定位由 request.cf 在边缘解析）
//   GET    /api/stats                      归档页汇总：访客数 / 地图点位 / 动态文章数与字数 / 留言数
//
// 安全设计：
//   - CORS 仅放行白名单站点，其余来源不带 CORS 头（浏览器自行拦截）
//   - 限流按 IP 哈希存储（加盐），不落原始 IP，兼顾隐私与防刷
//   - 留言存原文，XSS 由前端 textContent 渲染防护；长度按 Unicode 码点计
//   - 参数化查询防 SQL 注入

// ---- 配置 ----
const ALLOWED_ORIGINS = new Set([
  'https://hconzlvra.top',
  'https://www.hconzlvra.top',
  'https://hconzlvra.github.io',
  'http://localhost:4321',
  'http://127.0.0.1:4321',
]);
const NICKNAME_MAX = 24; // 昵称最大码点数
const CONTENT_MAX = 500; // 内容最大码点数
const RATE_WINDOW_MS = 60_000; // 限流窗口：1 分钟
const RATE_MAX = 3; // 窗口内最多 3 条
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 50;

// ---- 工具 ----
const json = (data, status, corsHeaders) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders },
  });

// 按码点计长度（emoji/生僻字按 1 计），并剥掉控制字符（保留换行与空格）
function cleanText(str) {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code === 10 || code === 32 || !(code < 32 || (code >= 127 && code < 160))) out += ch;
  }
  return out;
}
const countPoints = (str) => [...str].length;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- CORS ----
function corsHeadersFor(request) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.has(origin)) return {}; // 非白名单：不带 CORS 头
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ---- 限流 ----
async function rateLimitPass(env, ip) {
  const ipHash = await sha256Hex(ip + '|' + env.ADMIN_KEY); // 加盐：无法反推出 IP
  const now = Date.now();

  const row = await env.DB.prepare(
    'SELECT window_start, count FROM rate_limits WHERE ip_hash = ?'
  )
    .bind(ipHash)
    .first();

  if (!row || now - row.window_start > RATE_WINDOW_MS) {
    // 新窗口：不存在则插入，存在（窗口过期）则重置
    await env.DB.prepare(
      `INSERT INTO rate_limits (ip_hash, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(ip_hash) DO UPDATE SET window_start = excluded.window_start, count = 1`
    )
      .bind(ipHash, now)
      .run();
    return true;
  }
  if (row.count >= RATE_MAX) return false;

  await env.DB.prepare('UPDATE rate_limits SET count = count + 1 WHERE ip_hash = ?')
    .bind(ipHash)
    .run();
  return true;
}

// ---- 路由处理 ----
async function listMessages(request, env, cors) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const size = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, parseInt(url.searchParams.get('size') || String(PAGE_SIZE_DEFAULT), 10) || PAGE_SIZE_DEFAULT)
  );

  // 分页只按顶层留言算；回复（parent_id 非空）不占页
  const total = (
    await env.DB.prepare('SELECT COUNT(*) AS n FROM messages WHERE parent_id IS NULL').first()
  ).n;

  const { results } = await env.DB.prepare(
    'SELECT id, parent_id, nickname, content, created_at FROM messages WHERE parent_id IS NULL ORDER BY id DESC LIMIT ? OFFSET ?'
  )
    .bind(size, (page - 1) * size)
    .all();

  // 逐层拉取本页顶层留言的所有后代回复，挂成树（任意嵌套深度；回复按时间正序）。
  // 先按顶层 id 查一层，再按这层回复的 id 查下一层……直到没有新的回复为止。
  const byId = new Map();
  for (const m of results) {
    m.replies = [];
    byId.set(m.id, m);
  }
  let frontier = results.map((m) => m.id);
  while (frontier.length > 0) {
    const placeholders = frontier.map(() => '?').join(',');
    const { results: children } = await env.DB.prepare(
      `SELECT id, parent_id, nickname, content, created_at FROM messages WHERE parent_id IN (${placeholders}) ORDER BY id ASC`
    )
      .bind(...frontier)
      .all();

    const next = [];
    for (const c of children) {
      c.replies = [];
      byId.set(c.id, c);
      const parent = byId.get(c.parent_id);
      if (parent) parent.replies.push(c); // 防御：孤儿回复直接丢弃（正常写入不会出现）
      next.push(c.id);
    }
    frontier = next;
  }

  return json(
    { messages: results, page, size, total, hasMore: page * size < total },
    200,
    cors
  );
}

async function createMessage(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400, cors);
  }

  // 昵称可选，缺省"匿名"
  let nickname = body.nickname == null ? '' : cleanText(body.nickname);
  if (nickname === '') nickname = 'Anonymous';
  const content = body.content == null ? '' : cleanText(body.content);

  if (countPoints(nickname) > NICKNAME_MAX)
    return json({ error: `Nickname must be at most ${NICKNAME_MAX} characters` }, 400, cors);
  if (content === '') return json({ error: 'Message cannot be empty' }, 400, cors);
  if (countPoints(content) > CONTENT_MAX)
    return json({ error: `Message must be at most ${CONTENT_MAX} characters` }, 400, cors);

  // 反垃圾词表（逗号分隔，经 Pages 环境变量下发，不写死在代码里）
  // 命中时不给任何可探测的拒绝信号：挂起 30 秒后返回不带 CORS 头的响应，
  // 浏览器侧表现为"卡了很久然后网络错误"，与普通故障无异
  const spamTerms = String(env.SPAM_TERMS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (spamTerms.length > 0 && spamTerms.some((t) => nickname.includes(t) || content.includes(t))) {
    await new Promise((r) => setTimeout(r, 30_000));
    return new Response('', { status: 403 });
  }

  // 回复目标：可选；必须是已存在的留言（顶层或任意深度的回复都可以）
  let parentId = null;
  if (body.parent_id != null) {
    parentId = Number(body.parent_id);
    if (!Number.isInteger(parentId) || parentId < 1)
      return json({ error: 'Invalid reply target' }, 400, cors);
    const parent = await env.DB.prepare('SELECT id FROM messages WHERE id = ?')
      .bind(parentId)
      .first();
    if (!parent) return json({ error: 'The message you are replying to no longer exists' }, 404, cors);
  }

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await rateLimitPass(env, ip)))
    return json({ error: 'You are posting too fast — take a minute to breathe' }, 429, cors);

  const now = Date.now();
  const { meta } = await env.DB.prepare(
    'INSERT INTO messages (nickname, content, created_at, parent_id) VALUES (?, ?, ?, ?)'
  )
    .bind(nickname, content, now, parentId)
    .run();

  return json(
    { message: { id: meta.last_row_id, parent_id: parentId, nickname, content, created_at: now } },
    201,
    cors
  );
}

async function deleteMessage(request, env, cors, idStr) {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id)) return json({ error: 'Invalid message ID' }, 400, cors);

  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, cors);

  // 级联删除：递归 CTE 先找出该留言和它的全部子孙回复，再一并删掉
  const { meta } = await env.DB.prepare(
    `WITH RECURSIVE subtree(id) AS (
       SELECT id FROM messages WHERE id = ?
       UNION ALL
       SELECT m.id FROM messages m JOIN subtree s ON m.parent_id = s.id
     )
     DELETE FROM messages WHERE id IN (SELECT id FROM subtree)`
  )
    .bind(id)
    .run();
  if (meta.changes === 0) return json({ error: 'Message not found' }, 404, cors);
  return json({ ok: true }, 200, cors);
}

// ---- Posts（文章后台 API：主站为纯静态 GitHub Pages，文章存 D1，由 /admin 后台写入） ----
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const POST_TITLE_MAX = 120;
const POST_DESC_MAX = 300;
const POST_CONTENT_MAX = 100_000;

// 惰性建表：首次访问 posts 路由时创建，之后直接跳过
let postsTableReady = false;
async function ensurePostsTable(env) {
  if (postsTableReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS posts (
       slug        TEXT PRIMARY KEY,
       title       TEXT NOT NULL,
       description TEXT NOT NULL DEFAULT '',
       content     TEXT NOT NULL,
       created_at  INTEGER NOT NULL,
       updated_at  INTEGER NOT NULL
     )`
  ).run();
  postsTableReady = true;
}

// 管理员鉴权：Bearer <ADMIN_KEY>（留言删除与文章写入共用同一个密钥）
// 常数时间比较，避免时序侧信道
function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const key = String(env.ADMIN_KEY || '');
  return token.length === key.length && token === key;
}

async function listPosts(env, cors) {
  await ensurePostsTable(env);
  const { results } = await env.DB.prepare(
    'SELECT slug, title, description, created_at, updated_at FROM posts ORDER BY created_at DESC'
  ).all();
  return json({ posts: results || [] }, 200, cors);
}

async function getPost(env, cors, slug) {
  await ensurePostsTable(env);
  const post = await env.DB.prepare(
    'SELECT slug, title, description, content, created_at, updated_at FROM posts WHERE slug = ?'
  )
    .bind(slug)
    .first();
  if (!post) return json({ error: 'Post not found' }, 404, cors);
  return json({ post }, 200, cors);
}

async function savePost(request, env, cors) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, cors);
  await ensurePostsTable(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Request body must be valid JSON' }, 400, cors);
  }

  const slug = String(body.slug || '').trim();
  const title = body.title == null ? '' : cleanText(String(body.title));
  const description = body.description == null ? '' : cleanText(String(body.description));
  const content = String(body.content ?? '');

  if (!SLUG_RE.test(slug))
    return json({ error: 'Slug must be lowercase letters, digits and hyphens (max 64)' }, 400, cors);
  if (title === '') return json({ error: 'Title cannot be empty' }, 400, cors);
  if (countPoints(title) > POST_TITLE_MAX)
    return json({ error: `Title must be at most ${POST_TITLE_MAX} characters` }, 400, cors);
  if (countPoints(description) > POST_DESC_MAX)
    return json({ error: `Description must be at most ${POST_DESC_MAX} characters` }, 400, cors);
  if (content.trim() === '') return json({ error: 'Content cannot be empty' }, 400, cors);
  if (content.length > POST_CONTENT_MAX)
    return json({ error: `Content must be at most ${POST_CONTENT_MAX} characters` }, 400, cors);

  const now = Date.now();
  // Upsert：同 slug 覆盖更新（created_at 保留首次发布时间）
  await env.DB.prepare(
    `INSERT INTO posts (slug, title, description, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(slug) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       content = excluded.content,
       updated_at = excluded.updated_at`
  )
    .bind(slug, title, description, content, now, now)
    .run();

  const post = await env.DB.prepare(
    'SELECT slug, title, description, created_at, updated_at FROM posts WHERE slug = ?'
  )
    .bind(slug)
    .first();
  return json({ post }, 201, cors);
}

async function deletePost(request, env, cors, slug) {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401, cors);
  await ensurePostsTable(env);
  const { meta } = await env.DB.prepare('DELETE FROM posts WHERE slug = ?').bind(slug).run();
  if (meta.changes === 0) return json({ error: 'Post not found' }, 404, cors);
  return json({ ok: true }, 200, cors);
}

// ---- 访客统计（/archive 页：访问计数 + 访客地图） ----
// 隐私设计：
//   - 地理信息来自 Cloudflare 边缘的 IP 城市级定位（request.cf），不落 IP 原文
//   - 坐标取整到 0.1°（约 11km）后聚合存储：同城访客合并为一个点，无法还原个体
//   - 上报走 navigator.sendBeacon（fire-and-forget，不阻塞页面、无响应读取）
let visitTablesReady = false;
async function ensureVisitTables(env) {
  if (visitTablesReady) return;
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS visit_points (
         lat REAL NOT NULL,
         lon REAL NOT NULL,
         country TEXT NOT NULL DEFAULT '',
         count INTEGER NOT NULL DEFAULT 1,
         updated_at INTEGER NOT NULL,
         PRIMARY KEY (lat, lon)
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS visit_totals (
         id INTEGER PRIMARY KEY CHECK (id = 1),
         total INTEGER NOT NULL DEFAULT 0,
         updated_at INTEGER NOT NULL DEFAULT 0
       )`
    ),
  ]);
  visitTablesReady = true;
}

// POST /api/visit：beacon 上报（body 为空，定位在服务端从 request.cf 解析）
async function recordVisit(request, env) {
  await ensureVisitTables(env);
  const cf = request.cf || {};
  const lat = Number(cf.latitude);
  const lon = Number(cf.longitude);
  const country = String(cf.country || '').slice(0, 2).toUpperCase();
  const now = Date.now();

  const stmts = [
    env.DB.prepare(
      `INSERT INTO visit_totals (id, total, updated_at) VALUES (1, 1, ?)
       ON CONFLICT(id) DO UPDATE SET total = total + 1, updated_at = excluded.updated_at`
    ).bind(now),
  ];

  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85) {
    const rlat = Math.round(lat * 10) / 10;
    const rlon = Math.round(lon * 10) / 10;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO visit_points (lat, lon, country, count, updated_at) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(lat, lon) DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`
      ).bind(rlat, rlon, country, now)
    );
  }

  await env.DB.batch(stmts);
  return new Response(null, { status: 204 }); // beacon 不读响应体
}

// GET /api/stats：归档页一次性汇总（访客 + 动态文章 + 留言）
async function getStats(request, env, cors) {
  await ensureVisitTables(env);

  const totalRow = await env.DB.prepare('SELECT total FROM visit_totals WHERE id = 1').first();
  const { results: points } = await env.DB.prepare(
    'SELECT lat, lon, country, count FROM visit_points ORDER BY count DESC LIMIT 500'
  ).all();
  const regions = new Set((points || []).filter((p) => p.country).map((p) => p.country)).size;

  // messages 表可能在全新环境尚未初始化：拿不到就按 0
  let messages = 0;
  try {
    messages = (await env.DB.prepare('SELECT COUNT(*) AS n FROM messages').first()).n;
  } catch {
    /* 表不存在 */
  }

  // 动态文章（/admin 发布，存 posts 表）：数量与正文字符数
  await ensurePostsTable(env);
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(content)), 0) AS c FROM posts'
  ).first();

  return json(
    {
      visits: { total: totalRow ? totalRow.total : 0, regions, points: points || [] },
      posts: { count: row.n, chars: row.c },
      messages,
    },
    200,
    cors
  );
}

// ---- 入口（Pages _worker.js：export default 的 fetch 处理所有未命中静态资源的请求）----
export default {
  async fetch(request, env) {
    const cors = corsHeadersFor(request);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/api')
      return json({ service: 'guestbook-api', status: 'ok' }, 200, cors);

    if (path === '/api/messages' && request.method === 'GET')
      return listMessages(request, env, cors);

    if (path === '/api/messages' && request.method === 'POST')
      return createMessage(request, env, cors);

    const m = path.match(/^\/api\/messages\/(\d+)$/);
    if (m && request.method === 'DELETE') return deleteMessage(request, env, cors, m[1]);

    // ---- 文章后台 ----
    const pm = path.match(/^\/api\/posts\/([a-z0-9-]+)$/);

    if (path === '/api/posts' && request.method === 'GET') return listPosts(env, cors);
    if (path === '/api/posts' && request.method === 'POST') return savePost(request, env, cors);
    if (pm && request.method === 'GET') return getPost(env, cors, pm[1]);
    if (pm && request.method === 'DELETE') return deletePost(request, env, cors, pm[1]);

    if (path === '/api/admin/verify' && request.method === 'GET')
      return isAdmin(request, env) ? json({ ok: true }, 200, cors) : json({ error: 'Unauthorized' }, 401, cors);

    // ---- 访客统计 ----
    if (path === '/api/visit' && request.method === 'POST') {
      // 只接受自家站点的 beacon（sendBeacon 跨域 POST 会带 Origin；curl 等不带 Origin 的放行计数不记点）
      const origin = request.headers.get('Origin') || '';
      if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response(null, { status: 403 });
      return recordVisit(request, env);
    }
    if (path === '/api/stats' && request.method === 'GET') return getStats(request, env, cors);

    return json({ error: 'Not Found' }, 404, cors);
  },
};
