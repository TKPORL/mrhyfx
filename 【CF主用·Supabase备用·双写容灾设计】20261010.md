# 【CF主用·Supabase备用·双写容灾设计】20261010

> 状态：**设计稿，等站长确认后才动代码**
> **2026-10-15 重启**：Supabase 国内被墙加剧，站长要求把计数+评论彻底迁走（备选 D1 / Turso）。
> **结论：仍用 D1，不上 Turso。** 理由：
> ① D1 侧全套工件 10-09 已建好并本地验证过（`cf_d1_schema.sql` / `cf_worker.js`（PostgREST 兼容层，前端换域名零改动）/ 导入导出工具 / 实施手册），Turso 要把 Worker 数据层+工具链全部重写；
> ② 国内直连只有 CF 这条路实测过（api.tiho.us.ci 可直连），Turso 国内可达性无实测且无自有可换接入域的把握；
> ③ 当时的翻车不是 D1 额度不够，是「全量重导 upsert 双倍计」把 10 万/天干爆——日常写入 ~4000 行/天只占 4%，**增量导入无压力，红线依旧 = 永不全量重导**。
> Turso 定位：仅当未来 D1 日额度真成瓶颈时的第三后端候选，本期不做。

### 2026-10-15 重启步骤（在原第三~六节基础上，顺序不变，数字需重新对账）

0. **重新对账**：10-10 的快照已过期 5 天。先用 `cf_export_browser.js`（开代理网络）重导出一份 Supabase 全量 JSON 存档（只导出不导入，不碰 D1 额度），得到五表最新 count 与 cutoff 时间点。
1. **补齐增量**：`comments` / `game_likes` / `download_clicks` 按 `created_at > 10-10快照点` 增量导入（估算 5 天增量约 1~2 万行，双倍计 2~4 万，占日额度 <40%，安全）；`page_views` / `daily_page_views` 行数小（几千行级），整表覆盖重导双倍计也安全。
2. **Worker 部署双写双读版**（原第三节第 2 步）：D1 主写 + waitUntil 镜像 Supabase + 读超时回退；聚合上报三板斧一并做进去。部署前在 Dashboard 复制留存旧版 Worker 代码（回滚用）。
3. **前端切域名**（原第 3 步）：主站改 `gen.js` 的 `SITE.comments.url` → api.tiho.us.ci 后**重跑 gen.js**；备用站改 `game.html` / `tsinhoht.html` 两处。
4. **回归**（原第 4 步）：发评/点赞/后台回复删除/统计数字双端一致 + **国内关代理实测** + 故障演练（可选）。
5. Supabase 项目保留不删（双写镜像一直在写它，等于天然热备）。

> ⚠️ 前提核查（动手前必做）：Supabase 被墙 = **国内访客读不到，但导出在有代理的网络下仍可用**。若 Supabase 侧连导出都失败（项目被暂停/密钥失效），改为「以 D1 现有 10-10 快照为基线 + 线上帖子/评论人工补差」，损失窗口 = 10-10 至今的访客增量，需站长确认可接受再走。

### 2026-10-15 执行进度

- ✅ **步骤① 重导出存档**：`tsinho-supabase-export-2026-10-15.json`（14.1MB，五表全量）。当时实时数：comments 874 / game_likes 29 / page_views 2026 / daily 3641 / download_clicks 63028。
- ✅ **步骤② 增量导入 D1**（新工具 `scripts/cf_export_cli.js` + `scripts/cf_import_cli.js`，走本机代理 http://192.168.1.210:8502，**无需再开浏览器贴控制台**）：
  - comments 151（水位 2026-10-09T17:13，INSERT OR IGNORE 按 id 去重）
  - game_likes 29 / page_views 2026 / daily_page_views 3641（整表 upsert MAX 合并）
  - download_clicks 10615（水位 2026-10-10T00:00，**只导增量**，全量重导红线继续有效）
  - 合计写入 **16462 行**，占 D1 日额度 10 万的 ~16%，未爆
- ✅ **双端核对**：D1 comments 876 / page_views 2028 / daily 3643（比导出快照多 2 行 = 导出后这几分钟的真实新增流量，正常）；index.html 浏览数 43884 双端一致；download_clicks 最新一条已是今天的新帖点击
- ✅ **步骤③ Worker 双写双读版已部署**（站长在 CF Dashboard 粘贴 `scripts/cf_worker.js` + 配 SUPABASE_URL/SUPABASE_ANON_KEY；`https://api.tiho.us.ci/` 返回 `"sbMirror":true`）
- ✅ **步骤④ 前端已切换**（2026-10-15 23:1x 推送）：
  - 主站：`site.json` comments.url → api.tiho.us.ci（gen.js 全站注入）；`Tsinhoht.html` 写入端比对地址 ×2；`comments-preview.html` ×6；重跑 gen 幂等通过（55 帖 / qzt 242 卡）
  - 备用站 hyfxdyx：`game.html` / `index.html`(×2) / `tsinhoht.html` 共 4 处；期间合并同步机器人 5 个提交零冲突，新域名完好
  - 回滚方式：site.json（备用站三文件）域名改回 supabase.co 重推，10 分钟内恢复
- ⏭️ **待验收**：部署完成后——① 国内关代理打开帖子页评论区能加载 ② 发一条评论 → D1 与 Supabase 都出现 ③ 后台统计数字正常（后台「Project URL」要填 api.tiho.us.ci，「管理密钥」填 ADMIN_TOKEN）
- ⚠️ 遗留：`scripts/ops_backup.js`（daily-ops 例行备份）仍直连 Supabase——Supabase 降为热备后数据仍在新写入，短期不影响；二期应改为从 Worker/D1 拉，或双拉对账

- 教训记录：Worker admin 鉴权认 **X-Admin-Token 头**（或 body p_token），不认 Authorization Bearer——上次浏览器工具就是这么传的，CLI 版一开始传错头吃了 TOKEN_INVALID


> 背景：Supabase（supabase.co）近期国内直连持续被墙，访客评论区一直「Failed to load resource」/「评论加载失败（Failed to fetch），请稍后再试」。站长决定：**主用 CF Workers+D1（api.tiho.us.ci，国内可直连），Supabase 降为备用镜像**，数据两端同写，任一端失效自动切换。

---

## 一、目标

1. 访客读写全部走 CF Worker（`https://api.tiho.us.ci`），国内直连可用
2. 每条数据 **同时写入 D1 和 Supabase**（双写），两边始终是同一份数据
3. 读请求主走 D1，D1 挂/超时自动改读 Supabase——**自动切换，前端无感**
4. 回滚简单：前端域名改回 Supabase 推送即回原状，数据零丢失（因为两边都有）

## 二、现状（2026-10-10 07:30 实测）

| 表 | Supabase（现在） | D1（昨天 07:12 快照） | 差距 |
|---|---|---|---|
| comments 评论 | 724 | 709 | 15 条 |
| game_likes 点赞 | 20 | 6 | 14 条 |
| page_views 页面浏览（每网址一行、计数原地累加） | 928 | 115 | 813 行 + 旧行计数值全变 |
| daily_page_views 每日浏览 | 2509 | 1557 | 952 行 |
| download_clicks 下载点击 | 52405 | 51591 | 814 条 |

- 主站、备用站前端现在**都连 Supabase**
- Worker（cf_worker.js）已是 PostgREST 兼容层：comments.js / track.js / 两站后台**换域名即零改动**
- 昨天回退原因 = 当日全量导入吃光 D1 写额度；**今天增量仅约 2600 行（双倍计 ~5200），占 10 万日额度 5%**，无压力

## 三、实施步骤（顺序执行，每步可独立回滚）

### 第 1 步：补齐增量数据（数据对齐，先行）

- 用浏览器导出/导入工具（`cf_export_browser.js` / `cf_import_browser.js`）：
  - `page_views`、`daily_page_views`：**整表覆盖重导**（行少且是 upsert 聚合，只有全导才准确）
  - `comments`、`game_likes`、`download_clicks`：按 `created_at > 昨天07:12` 增量导
- 验收：五张表两边 count 完全一致（见第二节表格数字）

### 第 2 步：Worker 改造（核心，站长在 CF Dashboard 粘贴部署）

改 `scripts/cf_worker.js`，加双写双读：

```
读请求（GET）：
  ① 查 D1（带 3 秒超时）
  ② 超时/报错 → 原样转发 Supabase REST（形状兼容，直接透传）→ 返回并标注 X-Data-Source: supabase-fallback

写请求（POST/PATCH，/v1/admin/* 除外）：
  ① 先写 D1（主），成功即返回给前端（不等镜像）
  ② ctx.waitUntil() 异步镜像同一请求到 Supabase
  ③ 镜像失败 → console 记日志（路径+参数），后续版本可加重试队列
```

新增环境变量（CF Dashboard 里配）：
- `SUPABASE_URL` = `https://kydmccknlbpczeqppbtc.supabase.co`
- `SUPABASE_ANON_KEY` = 现有前端公开 anon key（本就是公开的，无泄密问题）

不镜像的路径：`/v1/admin/*`、`/health`、聚合缓存接口（只读）。

### 第 3 步：前端切域名（AI 改代码 + 重跑生成）

| 站点 | 文件 | 改什么 |
|---|---|---|
| 主站 | `scripts/gen.js`（SITE.comments.url 等） | supabase.co → `https://api.tiho.us.ci`，**重跑 gen.js**（注入进全站页面） |
| 备用站 | `game.html`、`tsinhoht.html` | 同上，直接改两处域名 |
| 备用站后台 | `tsinhoht.html` | Token 走 body，Worker 已兼容，无需额外改 |

### 第 4 步：全量回归（五项 + 双端核对）

1. 发评论 → 查 D1 和 Supabase **都**有这条
2. 点赞 → 两边 +1
3. 后台回复 / 删除 → 两边同步
4. 后台统计数字正常
5. **国内直连实测**：站长手机关代理打开两站，评论区/浏览量正常加载
6. 故障演练：CF Dashboard 临时把 D1 解绑（或改错变量）→ 评论区应自动走 Supabase 还能显示（验证 fallback 生效）→ 恢复

## 四、风险与边界（先说清，不藏着）

| 风险 | 说明 | 对策 |
|---|---|---|
| 双写非事务 | 极端情况一边写成功一边挂，产生一两条漂移 | Worker 记失败日志；后续可加「对账脚本」（定时比对两边 count+最新 id） |
| D1 写额度 | 免费 10 万行/天，upsert 双倍计 | 日常约 4000/天，余量 25 倍；**红线：不再跑全量重导** |
| Worker 请求额度 | 免费 10 万请求/天 | 当前流量几千/天，够 |
| 镜像写失败静默 | waitUntil 异步失败前端不知道 | 日志可查；对账脚本兜底（二期） |
| api.tiho.us.ci 国内直连 | 站长此前实测可用，但 CF IP 段政策可能变 | 这是走 CF 的固有风险；真被墙时 fallback 逻辑救不了（Worker 本身不可达），届时只能换接入域名（CF 自有域可随时加） |

## 五、回滚方案

- **前端回滚**：域名改回 supabase.co 推送（主站重跑 gen，备用站改两文件），10 分钟内完成；因双写数据两边一致，回滚零丢失
- **Worker 回滚**：粘贴回旧版 cf_worker.js（部署前先在 Dashboard 复制留存旧版本）
- **数据回滚**：不需要——Supabase 从头到尾只多不少（镜像只增）

## 六、待站长拍板的点

1. 方案整体 OK？（Worker 双写双读 vs 前端直连双写——后者要改 comments.js/track.js 且浏览器发双倍请求，不推荐）
2. 第 4 步故障演练做不做？（要做就得短暂解绑 D1 几分钟，期间写走 Supabase）
3. 对账脚本（定时比对两边数据并告警）要不要这期做？建议二期

## 七、请求最小化设计（流量涨了也扛得住，2026-10-10 站长追加需求）

目标：后台看到的数字仍然真实，但打向 D1/Supabase 的写请求大幅变少。原理 = **攒一批再写**，浏览器请求量不变（访客无感），省的是数据库写入次数。

### 三板斧

| 手段 | 之前 | 之后 | 效果 |
|---|---|---|---|
| **浏览/点击聚合上报** | 每次访问、每次下载点击 = 1 行写入 | Worker 在内存里攒计数，每 60 秒（或攒满 50 条）合并成一次批量 UPDATE 落库 | 写入次数降 ~95%：1000 次访问 ≈ 20 次写 |
| **每日浏览合行** | 每人每页一行 | 同一网址同一天只 update 一行累加（本就这设计，配合聚合才省） | 与上条叠加 |
| **评论读取缓存** | 每个访客都查一遍库 | Worker 边缘缓存 30~60 秒（已有一版，加长 + 覆盖评论列表接口） | 1000 人看同一页 ≈ 几十次读 |

### 算账（最坏情况：流量涨 10 倍）

- 现在：~4000 行写/天 → 聚合后 ~300 行/天
- 流量×10：~3000 行/天，仍只占 10 万日额度 3%
- Worker 请求额度同理：聚合只减不增

### 代价（要说清的）

- 聚合窗口内的数据**最多延迟 60 秒**才进库，后台统计不是秒级实时（对站长场景无感）
- Worker 实例重启会丢窗口内未落库的一小撮计数（几十秒的量，可忽略）
- 双写镜像同样享受聚合——攒好的批量同时发两边

> 结论：这期就把聚合上报做进 Worker（第 2 步一起改），不用二期。

---

## 八、名词解释：upsert 双倍计

upsert =「有则覆盖、无则插入」。D1 按行数计费，一次 upsert 在它账本上算「删 1 行 + 写 1 行」= **2 行写入**。所以昨天全量导 5.2 万条下载点击，实际按 10 万+ 计，直接吃光当日额度。增量 2600 条按双倍也就 5200，无压力。
