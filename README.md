# 黄油分享博客

每日黄油分享 · PC + 安卓双平台

## 结构

- `index.html` — 首页：每日分享列表（每日期一条，点击进入当天页面）
- `8.10.html` — 每日分享页面（幕布导出原风格）
- `publish.html` — 后台管理：在线发布/编辑/删除帖子、评论管理、链接配置（自动提交 GitHub）
- `assets/<日期>/` — 本地化的游戏封面图
- `games.json` — 最新一期的解析数据
- `links.json` — 顶部导航 / 底部合集按钮链接配置
- `counts.json` — 每日游戏数覆盖（如 `{"8.10": 92}`）
- `titles.json` — 帖子标题覆盖（文件名 → 显示标题，如 `{"8.10": "8.10黄油 92款（PC+安卓）"}`）
- `site.json` — 评论功能配置（Supabase：开关 + 项目地址 + anon 公钥）
- `scripts/gen.js` — 生成器（本地化图片、注入页头/按钮/动效/评论区、生成首页）
- `scripts/parse.js` — 解析幕布 HTML 生成 games.json
- `.github/workflows/gen.yml` — 每次推送自动运行 gen.js 并提交生成结果

## 更新方法（方式一：后台管理，推荐）

1. 打开 `https://tkporl.github.io/mrhyfx/publish.html`
2. 「发布帖子」：填文件名（如 8.11）、帖子标题（如 8.11黄油 95款（PC+安卓）），点「＋ 添加一个游戏」逐条填游戏名称/介绍/图片/下载链接
3. 「帖子管理」：刷新列表可编辑/删除已发布帖子（删除会连带清理图片）
4. 「链接配置」：网页里直接改全站按钮链接
5. GitHub Token（repo 权限）只需填一次，自动保存在本浏览器；点发布 → Actions 自动生成首页并部署，2-3 分钟后刷新生效（Ctrl+F5）

## 评论功能（Supabase 免费版，一次配置永久使用）

1. 注册 https://supabase.com → 登录后点「New project」（名称随意，地区选 Singapore/Tokyo 国内访问更快），等一两分钟
2. 左侧「SQL Editor」→ 把下面这段 SQL 全部粘贴进去 → 点 Run：

```sql
create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  pid uuid references comments(id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 30),
  email text not null,
  content text not null check (char_length(content) between 1 and 2000),
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
create index comments_url_idx on comments (url);
```

3. 左侧「Settings → API」：复制 **Project URL**（https://xxx.supabase.co）、**anon / publishable key**（public 那行）、**service_role / secret key**（secret 那行，只自己用，别外传）
4. 后台管理 → 「评论管理」→ 填三个值 → 「保存配置并启用评论」→ 2-3 分钟后所有帖子底部出现评论区
5. 访客填昵称 + 邮箱 + 内容即可评论，可回复；删除评论：后台「评论管理」页签，或把私钥填进去后帖子页面会直接出现删除按钮

> 安全说明：anon 公钥是公开的（RLS 规则限制只能发评论和读取）；service_role 私钥只存在你自己的浏览器里，绝不写入网站代码。

## 更新方法（方式二：本地）

1. 将当天幕布导出的 HTML 放入仓库根目录（文件名建议：`X.X.html`，如 `8.2.html`）
2. 运行 `node scripts/gen.js`：
   - 自动下载当天图片到 `assets/<日期>/`
   - 改写页脚为 `by Tsinho 发布`
   - 自动加入首页列表（新日期排最前）
3. 提交推送（Actions 会自动再跑一次，结果一致则不会重复提交）

> 本站内容仅供学习交流，请于下载后 24 小时内删除，支持正版。
