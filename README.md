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
- `.github/workflows/gen.yml` — 每次推送自动运行 gen.js 并提交生成结果
- `.github/workflows/send-mail.yml` — 后台回复评论时被 GitHub Actions 触发，走 QQ SMTP 发邮件通知

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

> 安全说明：Supabase 浏览器端禁止使用 secret 私钥，所以本项目不碰 secret key。公开的 anon/publishable 公钥只允许评论和读取（数据库 RLS 规则控制）；删除评论靠 SQL 里的自编管理密钥验证请求头，密钥只存在你自己的浏览器里，绝不写入网站代码。

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

### 旧版方式（Supabase Edge Function）

直接在函数里连 SMTP。适合已配置且实测可用的供应商；QQ 邮箱从海外数据中心（如 Supabase 新加坡）发信会被 QQ 静默吞掉，Gmail 新账号从数据中心发信也可能被丢，请以实测为准。

1. Supabase 控制台 → 左侧 **Edge Functions** → **Create a new function**：函数名填 `notify-reply`，**删掉**编辑器里自动生成的代码，粘贴本仓库 `supabase/functions/notify-reply/index.ts` 里的完整代码 → **Deploy**。

2. 然后给该函数配置密钥（Edge Functions → 点开函数 → **Settings → Secrets**，或 **Project Settings → Edge Functions → Manage secrets**）：

| 密钥名 | 示例值 | 说明 |
|---|---|---|
| `NOTIFY_SECRET` | `你随便编的一串字符` | 跟后台「邮件通知密钥」填同一个，防止别人乱用你的发信额度 |
| `SMTP_HOST` | `smtp.qq.com` | 邮箱的 SMTP 服务器地址 |
| `SMTP_PORT` | `465` | 一般 465（SSL） |
| `SMTP_USER` | `123456789@qq.com` | 发件邮箱账号 |
| `SMTP_PASS` | `16 位授权码` | **SMTP 授权码，不是登录密码** |
| `SMTP_FROM` | `123456789@qq.com` | 发件人邮箱（不填默认用 SMTP_USER） |
| `SMTP_FROM_NAME` | `黄油站站长` | 邮件里的发件人显示名（可选） |
| `SITE_NAME` | `Tsinho黄油站` | 邮件标题里的站点名（可选） |

3. 后台管理 → 「评论管理」→ 把 `NOTIFY_SECRET` 填到「邮件通知密钥」这一栏。之后后台发布回复时自动发邮件通知对方（GitHub Actions 通道优先，旧版兜底）；不填则回复照常发布、只是不发邮件（状态区会提醒）。

## 访问统计（可选，需额外运行 SQL）

帖子页面自动统计访问次数，仅后台管理可见（不在访客页面显示）。

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

> 本站内容仅供学习交流，请于下载后 24 小时内删除，支持正版。
