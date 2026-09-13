-- 新评论通知站长（GitHub Actions 方案）
-- 作用：
--   1. 建 pg_net 扩展（Postgres 内发 HTTP 请求）
--   2. 建服务端配置表 app_secret（RLS 锁死，PostgREST 读不到，密钥不进入代码仓库）
--   3. 建触发器：新评论入库后自动调用 GitHub Actions dispatch 发邮件通知站长
--
-- 运行前准备：
--   A) 在 GitHub 仓库 Settings → Secrets 中配置：
--      - ADMIN_EMAIL（站长收件邮箱）
--      - QQ_SMTP_USER / QQ_SMTP_PASS / SITE_NAME（已有则跳过）
--   B) 生成 GitHub Personal Access Token（Settings → Developer settings → Personal access tokens）
--      勾选 repo 权限，然后在 Supabase SQL Editor 运行：
--        insert into app_secret(name, value) values ('github_token', 'ghp_你的token');
--        insert into app_secret(name, value) values ('github_repo', 'TKPORL/mrhyfx');
--        on conflict (name) do update set value = excluded.value;
--   C) 本段 SQL 里的「你的anon公钥」替换为 site.json 里的 anonKey 值（公开的，非机密）
--      然后点击 Run 运行整段。

create extension if not exists pg_net;

create table if not exists app_secret (
  name text primary key,
  value text not null
);

alter table app_secret enable row level security;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant usage on schema net to postgres, anon, authenticated, service_role;

create or replace function notify_comment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_repo text;
begin
  if new.is_admin then
    return new;
  end if;

  begin
    select value into v_token from app_secret where name = 'github_token';
    select value into v_repo from app_secret where name = 'github_repo';

    if v_token is null or v_token = '' or v_repo is null or v_repo = '' then
      return new;
    end if;

    perform net.http_post(
      url := 'https://api.github.com/repos/' || v_repo || '/dispatches',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_token,
        'Accept', 'application/vnd.github+json'
      ),
      body := jsonb_build_object(
        'event_type', 'notify-comment',
        'client_payload', jsonb_build_object(
          'nick', new.nick,
          'email', new.email,
          'content', new.content,
          'url', new.url
        )
      )::text
    );
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists comments_notify_comment on comments;
create trigger comments_notify_comment
after insert on comments
for each row
execute function notify_comment_trigger();
