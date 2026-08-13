-- 新评论通知站长 升级 SQL（可选，建议开启）
-- 作用：
--   1. 建 pg_net 扩展（Postgres 内发 HTTP 请求）
--   2. 建服务端配置表 app_secret（RLS 锁死，PostgREST 读不到，密钥不进入代码仓库）
--   3. 建触发器：新评论入库后自动调用 notify-comment 函数发邮件通知站长
--
-- 运行前先做（两步）：
--   A) 在 Supabase Edge Functions 部署 notify-comment 函数（代码见 supabase/functions/notify-comment/index.ts）
--      并给该函数配置密钥：NOTIFY_SECRET / SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
--      （ADMIN_EMAIL 可选：默认把新评论通知发到 SMTP_USER 发件邮箱，填了则发到 ADMIN_EMAIL）
--   B) 把「你的NOTIFY_SECRET」替换为你给 notify-comment 配置的 NOTIFY_SECRET，运行下面这一行：
--        insert into app_secret(name, value) values ('notify_secret', '你的NOTIFY_SECRET')
--        on conflict (name) do update set value = excluded.value;
--   C) 本段 SQL 里的「你的anon公钥」替换为 site.json 里的 anonKey 值（公开的，非机密）
--      然后点击 Run 运行整段。全部一次性完成。

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
  v_secret text;
  v_anon text := 'sb_publishable_OfNqFNohTdrmzZ8dtu5bZQ_LcTk5iF9';
  v_proj text := 'https://kydmccknlbpczeqppbtc.supabase.co';
begin
  if new.is_admin then
    return new;
  end if;

  begin
    select value into v_secret from app_secret where name = 'notify_secret';
    if v_secret is null or v_secret = '' then
      return new;
    end if;

    perform net.http_post(
      url := v_proj || '/functions/v1/notify-comment',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'notify-secret', v_secret,
        'apikey', v_anon,
        'Authorization', 'Bearer ' || v_anon
      ),
      body := jsonb_build_object(
        'nick', new.nick,
        'email', new.email,
        'content', new.content,
        'url', new.url
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