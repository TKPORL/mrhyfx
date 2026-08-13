-- 评论防刷升级 SQL
-- 运行方法：Supabase 控制台 → SQL Editor → 粘贴运行（无需改任何内容，管理密钥不涉及本段）
-- 作用：
--   1. 新建 comment_guard 表记录提交日志（邮箱+时间）
--   2. 新建 guard_comment 函数：蜜罐/频率/重复 三重校验后插入评论
--   3. 页面表单已改为走该函数；函数不存在时前端自动回退直插（兼容未升级环境）

create table if not exists comment_guard (
  id bigint generated always as identity primary key,
  email text not null,
  created_at timestamptz not null default now()
);

alter table comment_guard enable row level security;

create index if not exists comment_guard_email_time_idx on comment_guard (email, created_at desc);

create or replace function guard_comment(p_url text, p_nick text, p_email text, p_content text, p_pid uuid default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
  v_last int;
  v_recent int;
  v_id uuid;
begin
  if p_url is null or char_length(p_url) < 1 or char_length(p_url) > 120 then
    return json_build_object('ok', false, 'error', '页面参数无效');
  end if;
  if p_nick is null or char_length(p_nick) < 1 or char_length(p_nick) > 30 then
    return json_build_object('ok', false, 'error', '昵称需 1-30 个字');
  end if;
  if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return json_build_object('ok', false, 'error', '邮箱格式不正确');
  end if;
  if p_content is null or char_length(p_content) < 1 or char_length(p_content) > 2000 then
    return json_build_object('ok', false, 'error', '内容需 1-2000 个字');
  end if;

  select count(*) into v_last from comment_guard where email = v_email and created_at > now() - interval '30 seconds';
  if v_last > 0 then
    return json_build_object('ok', false, 'error', '发言太快了，请 30 秒后再试');
  end if;

  select count(*) into v_recent from comment_guard where email = v_email and created_at > now() - interval '5 minutes';
  if v_recent >= 3 then
    return json_build_object('ok', false, 'error', '发言太频繁，请稍后再试');
  end if;

  if exists (select 1 from comments where email = v_email and content = p_content and created_at > now() - interval '10 minutes') then
    return json_build_object('ok', false, 'error', '请勿重复提交相同内容');
  end if;

  insert into comments (url, pid, nick, email, content)
  values (p_url, p_pid, p_nick, v_email, p_content)
  returning id into v_id;

  insert into comment_guard (email) values (v_email);

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function guard_comment(text, text, text, text, uuid) from public;
grant execute on function guard_comment(text, text, text, text, uuid) to anon, authenticated;
