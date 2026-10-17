-- ============================================================================
-- harden_anon.sql —— 收紧公钥权限（2026-10-17 计数数据被删事故的防再犯）
-- 原理：anon 公钥就明文放在网页源码里，此前任何人都能直接 DELETE/UPDATE 计数表。
--       计数写入走的是 SECURITY DEFINER 的 inc_* 函数（属主权限，不受影响），
--       所以撤销直接改删权限后：前台计数+1、评论发表、下载统计全部照常。
-- 执行方式：Supabase 控制台 → SQL Editor → 整段粘贴 → Run。
-- 回滚：执行本文件末尾注释里的 GRANT 语句即可恢复原状。
-- ============================================================================

-- 撤销公钥（anon）与登录用户（authenticated）对计数表的 直接改/删 权限：
REVOKE UPDATE, DELETE ON public.page_views      FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.daily_page_views FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.game_likes      FROM anon, authenticated;
REVOKE UPDATE, DELETE ON public.daily_snapshots FROM anon, authenticated;

-- 验证（可选，逐条跑）：
-- 1) 计数仍可用：随便打开网站一篇文章，看「今日访问」是否 +1
-- 2) 以下语句应报错（权限被拒）——说明收紧生效：
--    （用 anon 身份测试需借助前端控制台，或直接看本文件附带的验证说明）

-- ============================================================================
-- 回滚（恢复原状，仅在需要时执行）：
-- GRANT UPDATE, DELETE ON public.page_views       TO anon, authenticated;
-- GRANT UPDATE, DELETE ON public.daily_page_views TO anon, authenticated;
-- GRANT UPDATE, DELETE ON public.game_likes       TO anon, authenticated;
-- GRANT UPDATE, DELETE ON public.daily_snapshots  TO anon, authenticated;
-- ============================================================================
