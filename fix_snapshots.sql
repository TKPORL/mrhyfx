-- 修复每日数据快照（时区问题导致历史数据不准）
-- 运行方法：Supabase 控制台 → SQL Editor → 粘贴运行
-- 效果：清空 daily_snapshots 表中今天之前的所有错误记录
--       今天的记录会在下次打开后台「访问统计」时自动用正确时区重建

-- 方案一：只清掉今天之前的旧快照（推荐，今天的会自动重建）
DELETE FROM daily_snapshots WHERE day < current_date;

-- 方案二（可选）：如果今天的快照也不准，全部清掉
-- DELETE FROM daily_snapshots;

SELECT '已清理旧快照数据。打开后台「访问统计」页签后，今天的数据会自动重建。' AS result;
