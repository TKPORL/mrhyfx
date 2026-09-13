-- 1. 确保 created_at 列有默认值（新插入的行自动填充时间）
ALTER TABLE download_clicks ALTER COLUMN created_at SET DEFAULT now();

-- 2. 回填已有的 NULL created_at（用 updated_at 或行的近似时间）
UPDATE download_clicks SET created_at = now() WHERE created_at IS NULL;

-- 3. 确认没有剩余的 NULL
-- SELECT count(*) FROM download_clicks WHERE created_at IS NULL;
