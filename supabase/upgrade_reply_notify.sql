-- ============================================================
-- 用户回复通知（#31 + 密钥去前端化）
-- 作用：普通访客回复了某条评论后，自动给被回复者发邮件。
--       与 upgrade_notify_comment.sql 同一套路：数据库触发器 → GitHub Actions dispatch，
--       密钥只存在于 Supabase app_secret 表与 GitHub Secrets，不进代码仓库、不进网页。
-- 前置：已执行过 upgrade_notify_comment.sql（app_secret 表里有 github_token / github_repo），
--       且仓库已部署 send-mail.yml（本脚本复用它的 notify-reply 事件）。
-- 可重复执行（CREATE OR REPLACE / DROP IF EXISTS）。
-- 时间：2026-09-13
-- ============================================================

create or replace function notify_reply_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_repo text;
  v_parent_email text;
  v_parent_nick text;
begin
  -- 只管「普通用户的回复」：站长回复由后台页面自己触发（send-mail.yml 同事件），避免重复发信
  if new.pid is null or new.is_admin then
    return new;
  end if;

  begin
    select value into v_token from app_secret where name = 'github_token';
    select value into v_repo from app_secret where name = 'github_repo';
    if v_token is null or v_token = '' or v_repo is null or v_repo = '' then
      return new;
    end if;

    -- 被回复者的邮箱；空邮箱（理论上不存在，guard 函数强制填邮箱）则跳过
    select email, nick into v_parent_email, v_parent_nick
      from comments where id = new.pid;
    if v_parent_email is null or v_parent_email = '' then
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
        'event_type', 'notify-reply',
        'client_payload', jsonb_build_object(
          'to', v_parent_email,
          'toNick', coalesce(nullif(v_parent_nick, ''), '朋友'),
          'reply', new.content,
          'adminNick', coalesce(nullif(new.nick, ''), '访客'),
          'postTitle', coalesce(nullif(new.url, ''), ''),
          'url', new.url
        )
      )::text
    );
  exception when others then
    null;  -- 通知失败绝不影响评论入库
  end;

  return new;
end;
$$;

drop trigger if exists comments_notify_reply on comments;
create trigger comments_notify_reply
after insert on comments
for each row
execute function notify_reply_trigger();

-- ============================================================
-- 旧版 Supabase 邮件通道就此退役：
--   前端不再持有 notify-secret，notify-comment / notify-reply 两个 Edge Function
--   不会再被浏览器调用。请在 Supabase 后台把这两个函数的 NOTIFY_SECRET 环境变量
--   清空或删除函数本身（旧密钥 MyNotify@2026#888 已泄露在公开仓库历史里，必须作废）。
-- ============================================================
