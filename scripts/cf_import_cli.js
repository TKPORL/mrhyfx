/* Supabase 导出 JSON → D1 增量导入（CLI 版，走本机代理）。
 * 配套《【CF主用·Supabase备用·双写容灾设计】20261010.md》2026-10-15 重启步骤②。
 * 策略（与 Worker adminImport 语义对齐）：
 *   comments        增量（created_at > D1 水位，INSERT OR IGNORE 按 id 去重）
 *   page_views      整表重导（ON CONFLICT MAX(count) 合并，行数小）
 *   daily_page_views 整表重导（同上）
 *   game_likes      整表重导（同上）
 *   download_clicks 增量（纯 INSERT 无去重键，严禁全量重导！）
 * 用法：node scripts/cf_import_cli.js <导出JSON> [代理]
 * ADMIN_TOKENS 从 .workbuddy/memory/2026-10-09.md 读取，不进命令行。
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const FILE = process.argv[2];
const PROXY = process.argv[3] || 'http://192.168.1.210:8502';
if (!FILE || !fs.existsSync(FILE)) { console.error('用法: node scripts/cf_import_cli.js <导出JSON> [代理]'); process.exit(1); }

// 从项目记忆日志里解析 ADMIN_TOKENS（避免写死进脚本/命令行）
const mem = fs.readFileSync('.workbuddy/memory/2026-10-09.md', 'utf8');
const mTok = mem.match(/ADMIN_TOKENS[：=]\s*([A-Za-z0-9_\-]{8,})/);
if (!mTok) { console.error('在 .workbuddy/memory/2026-10-09.md 里找不到 ADMIN_TOKENS，中止'); process.exit(1); }
const TOKEN = mTok[1];

const WORKER = 'https://api.tiho.us.ci';
// 各表增量水位（2026-10-15 经 Worker GET 实测的 D1 最新 created_at）
const WATERMARK = {
  comments: '2026-10-15T13:46:59.219345+00:00',
  download_clicks: '2026-10-16T12:26:30.408Z',
};

function postChunk(table, rows) {
  const body = JSON.stringify({ table, rows });
  const out = execFileSync('curl', [
    '-s', '--max-time', '120', '-x', PROXY,
    '-X', 'POST', `${WORKER}/v1/admin/import`,
    '-H', 'Content-Type: application/json',
    '-H', `X-Admin-Token: ${TOKEN}`,  // Worker adminOk 只认 X-Admin-Token 头或 body p_token，不认 Authorization
    '--data-binary', '@-',
  ], { input: body, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  let r;
  try { r = JSON.parse(out); } catch (e) { throw new Error(`${table} 导入返回非 JSON：${out.slice(0, 150)}`); }
  if (r.error) throw new Error(`${table} 导入失败：${r.error}`);
  return r.imported;
}

(async () => {
  const dump = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const T = dump.tables;
  const plan = [
    { table: 'comments', pick: T.comments.rows.filter(r => (r.created_at || '') > WATERMARK.comments) },
    { table: 'game_likes', pick: T.game_likes.rows },
    { table: 'page_views', pick: T.page_views.rows },
    { table: 'daily_page_views', pick: T.daily_page_views.rows },
    { table: 'download_clicks', pick: T.download_clicks.rows.filter(r => (r.created_at || '') > WATERMARK.download_clicks) },
  ];
  let total = 0;
  for (const { table, pick } of plan) {
    let done = 0;
    for (let i = 0; i < pick.length; i += 2000) {
      done += postChunk(table, pick.slice(i, i + 2000));
      process.stdout.write(`  ${table}: ${done}/${pick.length}\r`);
    }
    total += done;
    console.log(`${table}: 导入 ${done} / 计划 ${pick.length}`);
  }
  console.log('合计写入', total, '行');
})().catch(e => { console.error('导入失败：' + (e && e.message || e)); process.exit(1); });
