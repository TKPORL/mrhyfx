-- comments 表添加 replied（已回/未回）字段升级 SQL
-- 运行方法：Supabase 控制台 → SQL Editor → 粘贴运行（无密钥涉及）

alter table comments add column if not exists replied boolean not null default false;

create index if not exists comments_replied_url_idx on comments (replied, url, created_at desc);