# scripts/

构建 / 工具脚本目录。仓库根 `package.json` 只有 `sharp` 依赖（图片压缩），无 npm scripts。所有脚本直接 `node scripts/<name>.js` 跑。

## `gen.js`（主构建脚本，92KB）

**做什么**：扫描仓库根的所有 HTML 帖子（白名单除外），重新生成：

- 所有帖子 HTML（注入 CSS / 评论脚本 / 访问量追踪 / 下载追踪）
- `index.html`（首页，按置顶 + 日期排序）
- `search.html`（前台搜索页）
- `search_index.json`（前台搜索用的游戏级索引）
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
- ❌ 不会覆盖：`assets/` 下的图片、`*.sql` 文件

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

仓库根的 `*.sql` 文件是在 Supabase Dashboard SQL Editor 一次性执行的脚本：

- `supabase/upgrade_comment_guard.sql` / `upgrade_notify_comment.sql` / `upgrade_replied.sql` — 评论相关 RPC / 触发器
- `supabase/upgrade_page_views.sql` — **访问量相关表 + RPC**（page_views / daily_page_views + inc_page_view / inc_daily_view），**部署后必须执行一次**，否则访问量写不进去
- `fix_dl_created_at.sql` — download_clicks 表 created_at 字段补默认值
- `fix_snapshots.sql` — 清理 daily_snapshots 时区错误的旧快照
- `清理失效访问记录.sql` — 清理 page_views / daily_page_views 里指向已删除帖子的死链记录
