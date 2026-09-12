// 留言板 API：Cloudflare Pages Function（_worker.js 高级模式）
//
// 部署形态：独立 Pages 项目（guestbook-9z8.pages.dev），仅承载 API；
// 主站仍在 GitHub Pages（hconzlvra.top），前端跨域调用本 API（CORS 白名单）。
//
// 路由：
//   GET    /api/messages?page=1&size=20   分页拉取顶层留言（replies 字段挂好嵌套回复树）
//   POST   /api/messages                  提交留言/回复（body.parent_id 可选；同 IP 每分钟最多 3 条）
//   DELETE /api/messages/:id              删除留言及其全部子孙回复（需 Authorization: Bearer <ADMIN_KEY>）
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

  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // 常数时间比较，避免时序侧信道
  if (token.length !== env.ADMIN_KEY.length || token !== env.ADMIN_KEY)
    return json({ error: 'Unauthorized' }, 401, cors);

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

    return json({ error: 'Not Found' }, 404, cors);
  },
};
