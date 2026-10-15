/* Supabase → JSON 全量导出（CLI 版，走本机代理）。
 * 配套《【CF主用·Supabase备用·双写容灾设计】20261010.md》2026-10-15 重启步骤①。
 * 只导出不导入，不碰 D1 额度。用法：
 *   node scripts/cf_export_cli.js [代理]   代理默认 http://192.168.1.210:8502
 * 读取 site.json 的 comments.url / comments.anonKey。
 * 产物：tsinho-supabase-export-<日期>.json（五表数组 + 各表 count + 导出时间）
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const PROXY = process.argv[2] || 'http://192.168.1.210:8502';
const site = JSON.parse(fs.readFileSync('site.json', 'utf8'));
const BASE = (site.comments && site.comments.url || '').replace(/\/$/, '');
const KEY = site.comments && site.comments.anonKey;
if (!BASE || !KEY) { console.error('site.json 缺 comments.url / anonKey，中止'); process.exit(1); }

const TABLES = ['comments', 'game_likes', 'page_views', 'daily_page_views', 'download_clicks'];
const PAGE = 1000;

function fetchPage(table, from) {
  const url = `${BASE}/rest/v1/${table}?select=*`;
  const out = execFileSync('curl', [
    '-s', '--max-time', '60', '-x', PROXY, url,
    '-H', `apikey: ${KEY}`, '-H', `Authorization: Bearer ${KEY}`,
    '-H', 'Prefer: count=exact',
    '-H', `Range: ${from}-${from + PAGE - 1}`,
  ], { encoding: 'utf8' });
  let rows;
  try { rows = JSON.parse(out); } catch (e) { throw new Error(`${table} 第 ${from} 行起返回非 JSON：${out.slice(0, 120)}`); }
  if (!Array.isArray(rows)) throw new Error(`${table} 第 ${from} 行起返回异常：${out.slice(0, 120)}`);
  return rows;
}

function totalCount(table) {
  // 先取 0-0 拿 content-range 总数，作为对账基准
  const hdrs = execFileSync('curl', [
    '-s', '-o', 'NUL', '-D', '-', '--max-time', '60', '-x', PROXY,
    `${BASE}/rest/v1/${table}?select=*`,
    '-H', `apikey: ${KEY}`, '-H', `Authorization: Bearer ${KEY}`,
    '-H', 'Prefer: count=exact', '-H', 'Range: 0-0',
  ], { encoding: 'utf8' });
  const m = hdrs.match(/content-range:\s*\d+-\d+\/(\d+)/i);
  if (!m) throw new Error(`${table} 拿不到 content-range 总数，响应头：\n${hdrs.slice(0, 300)}`);
  return Number(m[1]);
}

(async () => {
  const dump = { exportedAt: new Date().toISOString(), source: BASE, proxy: PROXY, tables: {} };
  for (const t of TABLES) {
    const expect = totalCount(t);
    const rows = [];
    for (let from = 0; from < expect; from += PAGE) {
      const page = fetchPage(t, from);
      rows.push(...page);
      if (page.length < PAGE) break;
      process.stdout.write(`  ${t}: ${rows.length}/${expect}\r`);
    }
    dump.tables[t] = { count: rows.length, supabaseCount: expect, rows };
    console.log(`${t}: 导出 ${rows.length} 行（Supabase 报数 ${expect}）${rows.length === expect ? '' : ' ⚠️ 行数不一致！'}`);
  }
  const file = `tsinho-supabase-export-${new Date().toISOString().slice(0, 10)}.json`;
  fs.writeFileSync(file, JSON.stringify(dump));
  console.log('已写入', file, `(${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`);
})().catch(e => { console.error('导出失败：' + (e && e.message || e)); process.exit(1); });
