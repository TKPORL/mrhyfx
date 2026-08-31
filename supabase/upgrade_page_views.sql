-- ============================================================
-- 访问量相关表 + RPC 初始化 / 升级脚本
-- 适用：mrhyfx 后台「今日访问 / 累计访问 / 每日访问」功能
-- 用途：在 Supabase SQL Editor 中一次性执行，即可恢复或修复
--       inc_page_view / inc_daily_view 写入链路
-- 风险：所有语句都是 CREATE/REPLACE/ADD IF NOT EXISTS，可重复执行
-- 时间：2026-08-31 首次创建
-- ============================================================

-- 1. page_views 表（每条 URL 一行，count 为累计访问次数）
CREATE TABLE IF NOT EXISTS page_views (
  url text PRIMARY KEY,
  count bigint DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- 2. daily_page_views 表（每个 URL × 每天 一行）
CREATE TABLE IF NOT EXISTS daily_page_views (
  url text NOT NULL,
  day date NOT NULL,
  count bigint DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (url, day)
);

-- 3. 索引（数据量上去后查询会越来越慢，提前建好）
CREATE INDEX IF NOT EXISTS idx_page_views_count ON page_views (count DESC);
CREATE INDEX IF NOT EXISTS idx_daily_page_views_day ON daily_page_views (day DESC);
CREATE INDEX IF NOT EXISTS idx_daily_page_views_url ON daily_page_views (url);

-- 4. download_clicks 表加 created_at 索引（fix_dl_created_at.sql 没建）
CREATE INDEX IF NOT EXISTS idx_download_clicks_created_at
  ON download_clicks (created_at);

-- 5. RPC: inc_page_view — 累计访问 +1
CREATE OR REPLACE FUNCTION inc_page_view(p_url text)
RETURNS void AS $$
BEGIN
  INSERT INTO page_views (url, count, updated_at)
  VALUES (p_url, 1, now())
  ON CONFLICT (url)
  DO UPDATE SET count = page_views.count + 1, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: inc_daily_view — 每日访问 +1
CREATE OR REPLACE FUNCTION inc_daily_view(p_url text, p_day date)
RETURNS void AS $$
BEGIN
  INSERT INTO daily_page_views (url, day, count, updated_at)
  VALUES (p_url, p_day, 1, now())
  ON CONFLICT (url, day)
  DO UPDATE SET count = daily_page_views.count + 1, updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS 开关（如果之前误开了 RLS 导致 anon 无法写入，这里关掉）
ALTER TABLE page_views DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_page_views DISABLE ROW LEVEL SECURITY;

-- 8. 给 anon 角色授权 RPC 执行权限（必须，否则浏览器 anon key 调不动）
GRANT EXECUTE ON FUNCTION inc_page_view(text) TO anon;
GRANT EXECUTE ON FUNCTION inc_page_view(text) TO authenticated;
GRANT EXECUTE ON FUNCTION inc_daily_view(text, date) TO anon;
GRANT EXECUTE ON FUNCTION inc_daily_view(text, date) TO authenticated;

-- 9. 验证：跑完上面所有语句后，可以单独跑以下两个查询确认成功
-- SELECT count(*) FROM page_views;
-- SELECT count(*) FROM daily_page_views WHERE day = current_date;
