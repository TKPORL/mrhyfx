# scripts/

构建 / 工具脚本目录。仓库根 `package.json` 只有 `sharp` 依赖（图片压缩），另提供 `npm run gen / backup / verify` 快捷命令（等价于直接 `node scripts/<name>.js`）。所有脚本也可直接 `node scripts/<name>.js` 跑。

## ⚠️ 操作红线（2026-09-09 事故教训）

1. **「游戏图片预览目录/」是站长专门放图片的工作目录，绝对不能删除/移动。** 它已加入 `.gitignore`，任何 git 操作（stash/reset/rebase/clean）都不应触碰它。执行 `git stash --include-untracked`、`git reset --hard` 等命令前，先确认工作区没有此目录及其他未跟踪文件。
2. **改任何生成逻辑前先 `git pull` 同步线上！**（2026-09-12 事故教训）站长通过后台 Tsinhoht.html 发布的新帖/新游戏/新公告只存在于远端 main；本地不同步就改 gen.js + 重跑，会用旧数据覆盖新内容，表现为“qzt 又丢游戏了”（实际是本地基线旧）。改前必验：`git fetch && git rev-list --count HEAD..origin/main` 必须为 0。qzt.html 游戏数以线上为准（会随发布增长，不要写死数字），重跑后对比：`node -e "console.log((require('fs').readFileSync('qzt.html','utf8').match(/<li class=\"node heading3/g)||[]).length))"` 应等于 counts.json 里的 qzt 值。
3. **幂等性检查**：改完 gen.js 后连续跑 2 次 `node scripts/gen.js`，第二次条目数必须与第一次一致，否则说明解析器有损，禁止提交。
4. 搜索页 `search_index.json` 每个条目必须有 `url` 字段（帖子页文件名）。丢失会导致搜索结果点击 404。
5. **qzt.html 是历史问题高发页，每次改完 gen.js 必须额外检查两件事**（站长从开发到现在反复遇到）：
   - **下载按钮层级**：`mrhx-dl` 必须和 `note`（游戏介绍）同层、在 note 之后，**绝不能嵌在 note 内部**——嵌了就会被卡片 CSS 截断隐藏，表现为“只有点图片展开才看到按钮”。自查：`node -e "const fs=require('fs');let n=0;fs.readdirSync('.').filter(f=>/\.html$/.test(f)).forEach(f=>{const h=fs.readFileSync(f,'utf8');const re=/<div class=\"note mm-editor\"[^>]*>([\s\S]*?)<\/div>/g;let m;while((m=re.exec(h)))if(m[1].includes('mrhx-dl'))n++});console.log('嵌套数:',n)"`，结果必须为 0。gen.js 已内置自动解套，但改了模板逻辑后必须重验。
   - **评论区**：打开 qzt.html 确认评论区加载的是 `/qzt.html` 自己的评论（条数与后台一致），不是别的帖子的，也不是空的。
   - **根因提醒**：qzt.html 保留幕布原始结构（节点带 `data-page-node-id`、`<div class="content mm-editor" >` 多一个空格等），gen.js 里任何**精确字符串匹配**的注入/解析代码在 qzt 上会静默失配，导致只有 qzt 出问题而其它帖子正常。写新匹配逻辑时一律用 `[^>]*` 容错属性，不要写死标签。历史上曾因此 qzt 的 72 款游戏全部进不了搜索索引。
6. **推送前必做：同步检查 + 零丢失验证**（2026-09-13 定型流程；站长通过后台发布的新帖/新游戏/新公告只存在于远端，站长可能忘了自己发过）。固定步骤，缺一不可：
   1. `git fetch origin main` 后跑 `git rev-list --count HEAD..origin/main`：**不为 0 就必须先同步**，禁止直接 push；
   2. 同步用 `git rebase origin/main`。生成产物（帖子 HTML / index.html / search_index.json / game_index.json / sitemap.xml / counts.json）冲突时一律取远端版（`git checkout --ours <文件>`），因为下一步会重新生成；手维护文件（site.json / titles.json / pins.json / icons.json / timestamps.json）冲突要人工合并，**不能无脑取一边**（站长的新公告/新标题在里面）；
   3. 重跑 `node scripts/gen.js` 两遍，第二遍输出必须与第一遍一致（幂等）；
   4. **零丢失对比**：逐帖提取 `origin/main` 版与本地版的游戏标题集合，线上有而本地没有的 = 事故，禁止 push（参考命令：`git show origin/main:qzt.html` 配合 gen.js 同款正则比对）；同时确认 `counts.json` 里每帖游戏数 = 页面实际节点数；
   5. 全部通过才 `git push`，推完到 GitHub Actions 盯一眼 gen 工作流是否绿勾。

## `gen.js`（主构建脚本，92KB）

**做什么**：扫描仓库根的所有 HTML 帖子（白名单除外），重新生成：

- 所有帖子 HTML（注入样式表引用 / 评论脚本引用 / 访问量追踪引用；#12 后公共代码在 `assets/css/site.css`、`assets/js/comments.js`、`assets/js/track.js`，帖子页只引用不内联）
- `index.html`（首页，按置顶 + 日期排序）
- `search.html`（前台搜索页）
- `search_index.json`（前台搜索用的游戏级索引；#32 已瘦身：每游戏只留 title/url/img/plat/links/intro(前80字)/source）
- `game_index.json`（后台搜索用的帖子级索引：每期帖子的标题 + 游戏名 + 帖子 intro）
- `titles.json`（手维护的中文标题字典，**gen.js 只读不写**）
- `counts.json` / `timestamps.json` / `pins.json` / `icons.json`（手维护元数据）
- `games.json`（合并所有游戏的扁平列表）
- `sitemap.xml`

**怎么跑**：

```bash
node scripts/gen.js
```

**会覆盖什么**：

- ✅ 会被覆盖：所有帖子 HTML（`8.10.html` / `2026825.html` 等）、`index.html`、`search.html`、所有 `*.json` 和 `sitemap.xml`
- ❌ 不会覆盖：`titles.json` / `counts.json` / `timestamps.json` / `pins.json` / `icons.json`（手维护，gen.js 只读）
- ❌ 不会覆盖：`assets/` 下的图片、`supabase/` 下的 `*.sql` 文件
- ⚠️ 公共代码文件（手维护，改样式/评论/统计逻辑只改这里，不要改帖子页内联代码）：`assets/css/site.css`、`assets/js/comments.js`、`assets/js/track.js`
- 📌 图片域名：统一 `cdn.jsdelivr.net`（站长实测定论：镜像源在站长网络下不可靠）。#14 缩略图与 #15 换源兜底均已按站长要求撤销，卡片直连原图；历史页面残留的 t_ 引用/镜像域名会被 gen.js 自动还原

**风险与回滚**：

- 如果你手改了某个帖子 HTML（例如手动调过样式、修过下载链接），跑 `gen.js` 会被覆盖回去。
- 跑前先 `git status` 看是否干净；跑后用 `git diff <file>` 确认改动符合预期。
- 后悔了：`git checkout HEAD -- <file>` 恢复单文件，或 `git reset --hard HEAD`（**只在你没 commit 自己改动时才能用**）。

**何时需要重跑**：

- 新增 / 修改 / 删除帖子 HTML
- 改了 `scripts/gen.js` 本身
- 改了 `assets/` 下的图片
- 改了 `titles.json` / `pins.json` / `icons.json` / `timestamps.json` / `counts.json`
- 改了 supabase 配置（在 `site.json` 里），影响脚本注入的访问量代码

**何时不需要重跑**：

- 改了 `Tsinhoht.html`（后台页面），只影响后台
- 改了 `style.css`，只影响样式
- 改了 `search.html` 内部逻辑（前提是不依赖 `search_index.json` 结构变化）

## 其他脚本

| 脚本 | 用途 |
|---|---|
| `parse.js` | 本地离线解析器，`node parse.js <html>` → 输出 `games.json` |
| `ops_backup.js` | 运维备份，定时拉 supabase 数据到本地 JSON |
| `scrape_library.js` | 抓取 `library.json` 用的爬虫 |
| `send_mail.js` / `send_mail_alert.js` | 邮件通知（评论回复 + 告警） |
| `add_compress_existing.js` | 把已有 PNG/JPG 转 webp |
| `check_qzt*.js` / `check_structure.js` / `check_script.js` / `count_nodes.js` | 开发期校验脚本 |

## Supabase 相关

Supabase 相关 SQL 脚本统一放在 `supabase/` 目录，是在 Supabase Dashboard SQL Editor 一次性执行的脚本：

- `supabase/upgrade_comment_guard.sql` / `upgrade_notify_comment.sql` / `upgrade_replied.sql` — 评论相关 RPC / 触发器
- `supabase/upgrade_page_views.sql` — **访问量相关表 + RPC**（page_views / daily_page_views + inc_page_view / inc_daily_view），**部署后必须执行一次**，否则访问量写不进去
- `supabase/fix_dl_created_at.sql` — download_clicks 表 created_at 字段补默认值
- `supabase/fix_snapshots.sql` — 清理 daily_snapshots 时区错误的旧快照
- `supabase/清理失效访问记录.sql` — 清理 page_views / daily_page_views 里指向已删除帖子的死链记录
