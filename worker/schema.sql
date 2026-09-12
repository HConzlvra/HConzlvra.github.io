-- 留言板表结构（已在 D1 中执行）
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname   TEXT NOT NULL DEFAULT '匿名',
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL -- Unix 毫秒
);

CREATE TABLE IF NOT EXISTS rate_limits (
  ip_hash      TEXT PRIMARY KEY, -- IP 哈希（加盐），不存原文
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
