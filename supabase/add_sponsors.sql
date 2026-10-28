-- ============================================================================
-- add_sponsors.sql —— 赞助记录表（2026-10-28 站长需求：赞助页显示「多少人、赞助了多少」）
-- 背景：微信/支付宝个人赞赏码**没有回调接口**，到账无法自动获取，
--       所以数据由站长在后台「赞助记录」页签手动逐笔录入，前台只负责展示。
-- 执行方式：Supabase 控制台 → 左侧 SQL Editor → 整段粘贴，**先把下面两处 <你的管理密钥> 换成真实密钥**再 Run（只需跑一次）。
--   ★密钥明文不写进本文件，避免又往公开仓库里贴一份（见《站点安全审计》R-02）。
-- 回滚：见文件末尾注释。
-- ============================================================================

create table if not exists public.sponsors (
  id         bigserial     primary key,
  nick       text          not null check (char_length(btrim(nick)) between 1 and 30),
  amount     numeric(10,2) not null check (amount > 0 and amount <= 1000000),
  paid_on    date          not null default current_date,
  visible    boolean       not null default true,
  created_at timestamptz   not null default now()
);

-- 排行榜口径：只取公开行，按金额从高到低，金额相同按日期早的在前
create index if not exists sponsors_rank_idx
  on public.sponsors (visible, amount desc, paid_on asc);

alter table public.sponsors enable row level security;

-- ① 匿名（网页访客）只能读「公开」的行 —— 站长把某人设为隐藏，他就立刻从排行榜消失
drop policy if exists sponsors_select_public on public.sponsors;
create policy sponsors_select_public on public.sponsors
  for select
  using (visible = true);

-- ② 管理密钥可全量增删改查（后台「赞助记录」页签用 x-admin-key 请求头）
--    ★下面这串与 README 里那份管理密钥相同，方便后台直接使用（后台已存着它）。
--    注意：该串曾出现在公开 README（见《【站点安全审计与优化建议】20261028》R-02），
--    若你还没轮换，等于赞助表的写权限也是公开的。轮换时把这里与其它 policy 一起改。
drop policy if exists sponsors_admin_all on public.sponsors;
create policy sponsors_admin_all on public.sponsors
  for all
  using      (coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = '<你的管理密钥>')
  with check (coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = '<你的管理密钥>');

-- ③ 显式授权：匿名只读，登录用户（如果你以后接入登录）可读写
grant select on public.sponsors to anon;
grant select, insert, update, delete on public.sponsors to authenticated;

-- ============================================================================
-- 验证（跑完在 SQL Editor 里逐条执行确认）：
--   1) select * from public.sponsors;                       -- 应返回空表、无报错
--   2) select count(*) from public.sponsors;                -- 应为 0
--   3) 打开线上 sponsor.html，页面应显示「还没有赞助记录」而不是报错
--   4) 在后台「赞助记录」页签添加一条 → 刷新赞助页应能看到
--
-- 回滚（仅在需要撤销时执行，会丢数据）：
--   drop table if exists public.sponsors;
-- ============================================================================
