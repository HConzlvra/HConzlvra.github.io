import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const postsDir = path.join(rootDir, 'src/content/posts');
const apiBase = (process.env.PUBLIC_API_BASE || 'https://guestbook-9z8.pages.dev/api').replace(/\/+$/, '');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toFrontMatterValue(value) {
  if (value == null) return '';
  const str = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
  return str;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.url}`);
  }
  return res.json();
}

async function main() {
  ensureDir(postsDir);

  let payload;
  try {
    payload = await fetchJson(`${apiBase}/posts`);
  } catch (error) {
    console.warn('[sync-dynamic-posts] API unavailable, skipping dynamic sync:', error.message);
    return;
  }

  const posts = Array.isArray(payload?.posts) ? payload.posts : [];
  if (!posts.length) {
    console.log('[sync-dynamic-posts] no dynamic posts found');
    return;
  }

  for (const item of posts) {
    const slug = String(item.slug || '').trim();
    if (!slug) continue;

    const target = path.join(postsDir, `${slug}.md`);
    if (fs.existsSync(target)) {
      continue;
    }

    let fullPost;
    try {
      fullPost = await fetchJson(`${apiBase}/posts/${slug}`);
    } catch (error) {
      console.warn(`[sync-dynamic-posts] skip ${slug}: fetch detail failed`, error.message);
      continue;
    }

    const post = fullPost?.post || {};
    const title = toFrontMatterValue(post.title || slug);
    const description = toFrontMatterValue(post.description || '');
    const createdAt = post.created_at ? new Date(Number(post.created_at)).toISOString() : new Date().toISOString();
    const content = typeof post.content === 'string' ? post.content : '';

    const fileContent = [
      '---',
      `title: "${title}"`,
      description ? `description: "${description}"` : null,
      `pubDate: "${createdAt}"`,
      '---',
      '',
      content.trim() || `# ${title}`,
      '',
    ].filter(Boolean).join('\n');

    fs.writeFileSync(target, fileContent, 'utf8');
    console.log(`[sync-dynamic-posts] synced ${slug}.md`);
  }
}

main();
