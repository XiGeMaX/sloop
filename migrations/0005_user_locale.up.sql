ALTER TABLE users ADD COLUMN locale TEXT NOT NULL DEFAULT ''
  CHECK (locale IN ('', 'zh-CN', 'en'));
