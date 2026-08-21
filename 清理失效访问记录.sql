-- ============================================================
-- 清理已删除帖子留下的失效访问记录
-- 用途：删除 page_views / daily_page_views 两张表里
--       指向已删除页面（/posts/、/game/、/single/game/ 及几个测试预览页）的记录
-- 使用方法：登录 Supabase 后台 → 左侧 SQL Editor → 新建查询 → 粘贴以下全部内容 → 点 Run
-- 说明：先执行「第一步预览」看会删多少条，确认无误后再执行「第二步删除」
-- ============================================================


-- ---------- 第一步：预览（只查看，不删除）----------
-- 先看主表里将要被删的记录（应约 143 条、累计约 763 次）
SELECT url, count
FROM page_views
WHERE url LIKE '/posts/%'
   OR url LIKE '/game/%'
   OR url LIKE '/single/game/%'
   OR url IN ('/orig3.html', '/orig_812pcaz.html', '/test-view-check.html', '/comments-preview.html')
ORDER BY count DESC;


-- ---------- 第二步：正式删除（确认预览无误后再执行下面两条）----------

-- 删除主表 page_views 里的失效记录
DELETE FROM page_views
WHERE url LIKE '/posts/%'
   OR url LIKE '/game/%'
   OR url LIKE '/single/game/%'
   OR url IN ('/orig3.html', '/orig_812pcaz.html', '/test-view-check.html', '/comments-preview.html');

-- 删除每日表 daily_page_views 里对应的失效记录（保证每日统计也干净）
DELETE FROM daily_page_views
WHERE url LIKE '/posts/%'
   OR url LIKE '/game/%'
   OR url LIKE '/single/game/%'
   OR url IN ('/orig3.html', '/orig_812pcaz.html', '/test-view-check.html', '/comments-preview.html');


-- ---------- 第三步：核对（可选）----------
-- 再跑一次预览，结果应该为 0 行，说明已清理干净
SELECT count(*) AS 剩余失效记录数
FROM page_views
WHERE url LIKE '/posts/%'
   OR url LIKE '/game/%'
   OR url LIKE '/single/game/%'
   OR url IN ('/orig3.html', '/orig_812pcaz.html', '/test-view-check.html', '/comments-preview.html');
