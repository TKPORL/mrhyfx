# 黄油分享博客

每日黄油分享 · PC + 安卓双平台

## 结构

- `index.html` — 首页：每日分享列表（每日期一条，点击进入当天页面）
- `8.10.html` — 每日分享页面（幕布导出原风格）
- `Tsinhoht.html` — 后台管理：在线发布/编辑/删除帖子、评论管理、链接配置（自动提交 GitHub）
- `assets/<日期>/` — 本地化的游戏封面图
- `games.json` — 最新一期的解析数据
- `links.json` — 顶部导航 / 底部合集按钮链接配置
- `counts.json` — 每日游戏数覆盖（如 `{"8.10": 92}`）
- `titles.json` — 帖子标题覆盖（文件名 → 显示标题，如 `{"8.10": "8.10黄油 92款（PC+安卓）"}`）
- `pins.json` — 置顶帖子列表（数组，如 `["8.10", "8.11"]`，排在前面的显示越靠前；后台「帖子管理」可一键置顶/取消）
- `site.json` — 评论功能配置（Supabase：开关 + 项目地址 + anon 公钥）
- `scripts/gen.js` — 生成器（本地化图片、注入页头/按钮/动效/评论区、生成首页）
- `scripts/parse.js` — 解析幕布 HTML 生成 games.json
- `scripts/send_mail.js` — 邮件发送脚本（GitHub Actions 里用 QQ SMTP 发「站长回复」通知，零依赖）
- `scripts/notify_comment_mail.js` — 新评论通知站长邮件脚本（数据库触发 → GitHub Actions → QQ SMTP）
- `.github/workflows/gen.yml` — 每次推送自动运行 gen.js 并提交生成结果
- `.github/workflows/send-mail.yml` — 后台回复评论时被 GitHub Actions 触发，走 QQ SMTP 发邮件通知
- `.github/workflows/notify-comment.yml` — 新评论通知站长邮件（Supabase 触发器 dispatch 到 GitHub Actions）

## 更新方法（方式一：后台管理，推荐）

1. 打开 `https://tkporl.github.io/mrhyfx/Tsinhoht.html`
2. 「发布帖子」：填文件名（如 8.11）、帖子标题（如 8.11黄油 95款（PC+安卓）），点「＋ 添加一个游戏」逐条填游戏名称/介绍/图片/下载链接
3. 「帖子管理」：刷新列表可编辑/删除已发布帖子（删除会连带清理图片）；点「置顶」可把某个帖子固定到首页最前面（再点取消），刚置顶的排最上
4. 「链接配置」：网页里直接改全站按钮链接
5. GitHub Token（repo 权限）只需填一次，自动保存在本浏览器；点发布 → Actions 自动生成首页并部署，2-3 分钟后刷新生效（Ctrl+F5）

## 评论功能（Supabase 免费版，一次配置永久使用）

1. 注册 https://supabase.com → 登录后点「New project」（名称随意，地区选 Singapore / Tokyo 国内访问更快），等一两分钟
2. 左侧「SQL Editor」→ 把下面这段 SQL 全部粘贴进去，**先把最后一行的 `你的管理密钥` 换成你自己编的一串随机字符**（如 `MrhxAdmin@2026#Abc`，要记住它，后台删除评论要用），再点 Run：

```sql
drop table if exists comments cascade;

create table comments (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  pid uuid references comments(id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 30),
  email text not null,
  content text not null check (char_length(content) between 1 and 2000),
  is_admin boolean not null default false,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;

create policy "comments_select" on comments for select using (true);

create policy "comments_insert" on comments for insert
with check (
  char_length(nick) between 1 and 30
  and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
  and char_length(content) between 1 and 2000
  and char_length(url) between 1 and 120
);

create policy "comments_delete_admin" on comments for delete
using (
  coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = '你的管理密钥'
);

create policy "comments_update_admin" on comments for update
using (
  coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = '你的管理密钥'
);

create index comments_url_idx on comments (url);
```

> 已经建过评论表的老项目：不用重跑上面整段，只需在 SQL Editor 里运行下面这段升级 SQL（把 `你的管理密钥` 换成你之前编的那串），即可获得新功能（置顶评论 + 站长回复邮件）：

```sql
alter table comments add column if not exists is_admin boolean not null default false;
alter table comments add column if not exists pinned boolean not null default false;

drop policy if exists "comments_update_admin" on comments;
create policy "comments_update_admin" on comments for update
using (
  coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = '你的管理密钥'
);

drop policy if exists "comments_delete_admin" on comments;
create policy "comments_delete_admin" on comments for delete
using (
  coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = '你的管理密钥'
);
```

3. 左侧「Settings → API」：复制 **Project URL**（https://xxx.supabase.co）和 **publishable / anon key**（`sb_publishable_...` 或 `eyJ...` 那行 public 的）
4. 后台管理 → 「评论管理」→ Project URL、anon 公钥、管理密钥（第 2 步 SQL 里编的那串）→ 「保存配置并启用评论」→ 2-3 分钟后所有帖子底部出现评论区
5. 访客填昵称 + 邮箱 + 内容即可评论，可回复；删除/置顶评论：后台「评论管理」页签，或帖子页面评论下方直接出现删除/置顶按钮（管理员浏览器填了管理密钥后）。置顶的评论会固定在评论区最前面。点击邮箱输入框会弹出使用提示：建议填写日常使用的邮箱，站长回复会发送到该邮箱。

### 评论已回/未回管理（可选）

后台「评论管理」页签的评论列表支持筛选 **全部 / 未回 / 已回**，新评论排在最上面。你在后台「回复」某条评论后，系统会自动把该楼层标记为「已回」；也可点评论上的「标已回 / 标未回」手动切换。

在 Supabase **SQL Editor** 里运行本仓库 `supabase/upgrade_replied.sql` 的内容即可（comments 表添加 `replied` 字段）。不运行也能用后台（只是所有评论都显示为未回，且不能筛选已回）。

> 安全说明：Supabase 浏览器端禁止使用 secret 私钥，所以本项目不碰 secret key。公开的 anon/publishable 公钥只允许评论和读取（数据库 RLS 规则控制）；删除评论靠 SQL 里的自编管理密钥验证请求头，密钥只存在你自己的浏览器里，绝不写入网站代码。

### 评论防刷（可选，建议开启）

页面表单默认走 `guard_comment` 函数，带三重防刷：**蜜罐陷阱**（隐藏字段，机器人乱填会被静默丢弃）、**频率限制**（同一邮箱 30 秒内只能发 1 条、5 分钟内最多 3 条）、**重复内容拦截**（同一邮箱 10 分钟内重复提交相同内容会拒绝）。未运行下面 SQL 前前端会自动回退到直接插入，功能不受影响。

在 Supabase **SQL Editor** 里运行本仓库 `supabase/upgrade_comment_guard.sql` 的内容即可（一次配置永久有效）。运行后想彻底封死直插（只允许走防刷函数），可再运行：

```sql
drop policy if exists "comments_insert" on comments;
```

## 站长回复邮件通知（可选，站长回复评论后自动发邮件给用户）

用户在帖子里回复/评论后是看不到站长的回复的，配置下面两步后：你在「评论管理」里回复某条评论，系统会自动往**评论者的邮箱**发一封「站长回复了你」的邮件。

### 推荐方式（GitHub Actions + QQ SMTP，无需 Supabase 函数）

后台的 GitHub Token 在回复评论时触发仓库的 `send-mail` 工作流，由 GitHub Actions 用你的 **QQ 邮箱**发邮件。QQ→QQ 投递最稳（不会被吞，老项目已验证 GitHub Actions 海外 IP 直连 smtp.qq.com 可用）。

1. 在你的仓库 **Settings → Secrets and variables → Actions** 添加三个 secret：
   - `QQ_SMTP_USER`：你的 QQ 邮箱账号（如 `123456789@qq.com`）
   - `QQ_SMTP_PASS`：**SMTP 授权码，不是登录密码**（QQ 邮箱：设置 → 账户 → 开启 POP3/SMTP 服务 → 短信验证后生成 16 位授权码）
   - `SITE_NAME`（可选）：邮件标题里的站点名，如 `Tsinho黄油站`
2. 后台「评论管理」→ 确定「发布帖子」页签里已填 GitHub Token（勾选 **repo + workflow** 权限）与仓库名。
3. 之后你在后台回复评论，约 1 分钟内对方的邮箱就能收到通知。

> 免费额度：GitHub Actions 公共仓库每月免费 2000 分钟，完全够用；QQ 邮箱个人 SMTP 支持免费收发。邮件仅用于通知，访客邮箱只存在 Supabase 数据库里，不会出现在页面代码中。

### （已废弃）旧版 Supabase Edge Function 邮件通道

> ⚠️ 2026-09-13 密钥迁移：前端不再持有 notify-secret，`notify-comment` / `notify-reply` 两个 Edge Function 不再被浏览器调用，已退役。
> 新评论、站长回复、用户互回复的邮件通知，统一走下面的「数据库触发器 → GitHub Actions」方案，密钥只存在服务端，不进入代码仓库也不下发到网页。
> 旧密钥 `NOTIFY_SECRET` 曾在公开仓库历史中泄露，**必须作废**：请在 Supabase 后台删除这两个函数或清空其 `NOTIFY_SECRET` 环境变量。

## 用户评论被回复也通知（#31，与上面同机制）

普通用户 A 回复了用户 B 的评论时，自动给 B 发一封「XXX 回复了你的评论」邮件。站长回复仍走上面的 send-mail 通道。

1. 先完成上面「新评论自动通知站长」的步骤 1–2（app_secret 表里有 github_token / github_repo）。
2. 打开 Supabase **SQL Editor**，把本仓库 `supabase/upgrade_reply_notify.sql` 贴入运行（可重复执行）。
3. 仓库已部署 `send-mail.yml`（监听 `notify-reply` 事件），无需额外配置。

> 触发器只处理「普通用户的回复」（pid 非空且 is_admin=false），站长回复由后台页面自己触发，不会重复发信。通知失败绝不影响评论入库。

## 新评论自动通知站长（可选，有人评论后发邮件告诉你）

有人在你站点发了新评论，系统自动发一封邮件到你的邮箱：包含**有人评论了 + 评论内容 + 帖子链接**。实现方式：数据库触发器 → GitHub Actions dispatch → QQ SMTP 发邮件（服务端触发，不暴露任何密钥给浏览器，也不会漏通知）。

1. 生成 GitHub Personal Access Token：GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token，勾选 **repo** 权限。

2. 在 Supabase SQL Editor 中运行以下两行，把 token 和仓库名填进去：

   ```sql
   insert into app_secret(name, value) values ('github_token', 'ghp_你的token');
   insert into app_secret(name, value) values ('github_repo', 'TKPORL/mrhyfx');
   on conflict (name) do update set value = excluded.value;
   ```
   （密钥存在数据库服务端配置表中，RLS 锁死，浏览器读不到，不进入代码仓库）

3. 打开 Supabase **SQL Editor**，把本仓库 `supabase/upgrade_notify_comment.sql` 的代码贴入运行。先按文件顶部注释把 `你的anon公钥` 替换成 site.json 里的 anonKey 值，然后点 **Run** 即可（一次性配置，永久有效）。

4. 确保 GitHub 仓库 Settings → Secrets 已配置：`ADMIN_EMAIL`（你的收件邮箱）、`QQ_SMTP_USER`、`QQ_SMTP_PASS`、`SITE_NAME`（已有则跳过）。

> 运行后每有人评论一条，你的邮箱会收到一封「【站点名】收到一条新评论」的邮件。

## 访问统计（可选，需额外运行 SQL）

帖子页面自动统计访问次数：后台管理可看详细数据，**帖子标题旁也会向访客显示「已被浏览 N 次」**（#30，anon key 直读 page_views，无需额外配置）。

1. 在 Supabase SQL Editor 中运行以下 SQL（管理密钥已填好，直接复制运行即可）：

```sql
create table if not exists page_views (
  url text primary key,
  count bigint not null default 0
);

alter table page_views enable row level security;

drop policy if exists "page_views_select_admin" on page_views;
create policy "page_views_select_admin" on page_views
  for select using (
    coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = 'MrhxAdmin@2026#Abc'
  );

create or replace function inc_page_view(p_url text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into page_views(url, count) values (p_url, 1)
  on conflict (url) do update set count = page_views.count + 1
$$;

revoke execute on function inc_page_view(text) from public;
grant execute on function inc_page_view(text) to anon;
```

2. 运行后，每次有人打开帖子页面自动 +1 访问次数。
3. 后台管理「帖子管理」列表会显示每个帖子的访问量，仅管理密钥登录后可见。

## 每日统计（独立访客，按天去重）

在 Supabase SQL Editor 中运行以下 SQL（与上面 `page_views` 表同理，独立访客按天去重）：

```sql
create table if not exists daily_page_views (
  url text not null,
  day date not null,
  count bigint not null default 0,
  primary key (url, day)
);

alter table daily_page_views enable row level security;

drop policy if exists "daily_page_views_select_admin" on daily_page_views;
create policy "daily_page_views_select_admin" on daily_page_views
  for select using (
    coalesce(current_setting('request.headers', true)::jsonb->>'x-admin-key', '') = 'MrhxAdmin@2026#Abc'
  );

create or replace function inc_daily_view(p_url text, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into daily_page_views(url, day, count) values (p_url, p_day, 1)
  on conflict (url, day) do update set count = daily_page_views.count + 1
$$;

revoke execute on function inc_daily_view(text, date) from public;
grant execute on function inc_daily_view(text, date) to anon;
```

> 每日统计通过 localStorage 按天去重：同一浏览器同一天访问同一页面只算 1 次，第二天日期变化重新计数（实现真正的"每日独立访客"）。后台「访问统计」面板会同时显示"今日访问"和"累计访问"。

## 更新方法（方式二：本地）

1. 将当天幕布导出的 HTML 放入仓库根目录（文件名建议：`X.X.html`，如 `8.2.html`）
2. 运行 `node scripts/gen.js`：
   - 自动下载当天图片到 `assets/<日期>/`
   - 改写页脚为 `by Tsinho 发布`
   - 自动加入首页列表（新日期排最前）
3. 提交推送（Actions 会自动再跑一次，结果一致则不会重复提交）

## 发布自检（自动防护）

`scripts/gen.js` 每次都自动校验：首页包含每个帖子的链接、正文节点存在、游戏数与首页一致、标题同步、评论区与统计脚本注入成功。任一失败会生成 `gen_report.txt` 并让 Actions 工作流显红，**不会静默发布半成品**；推送失败也会标记失败。

## 每日自动备份与健康巡检（可选）

`.github/workflows/ops.yml` 每天自动：备份 Supabase 的评论与访问统计数据到 `backup/<日期>/`（保留最近 30 份）、检查首页可用性与 Supabase 连通性，任一异常向管理员发告警邮件（走 QQ SMTP）。

- 添加 Actions secret `ADMIN_KEY`（= 你在评论 SQL 里编的管理密钥，用于读取统计表）。不配置则只备份评论，跳过统计表备份。
- 添加 Actions secret `ADMIN_EMAIL`（可选，告警收件邮箱；不填则用 `QQ_SMTP_USER`）。
- 首次可手动在 Actions 页面 Run workflow 触发一次测试。

## 发帖原子化

后台「发布帖子」现在把 **正文 + titles.json + counts.json 合并成一次提交**，避免"正文已上线但标题/数量还没跟上"的中间状态。

## RSS 与站点地图

每次生成自动输出 `rss.xml`（每日 RSS 订阅）与 `sitemap.xml`（搜索引擎提交用），站点 URL 可在 `site.json` 里加 `"url": "https://你的域名/"` 自定义（默认 `https://tkporl.github.io/mrhyfx/`）。

> 本站内容仅供学习交流，请于下载后 24 小时内删除，支持正版。
