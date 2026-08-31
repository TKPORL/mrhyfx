const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// SSRF 防护：URL 写死，不接受任何 env / 用户输入；如需更换 host 必须改源码
const HOST_URL = 'https://tkporl.github.io/mrhyfx/';
// 只允许访问 supabase 后端 host；HOME host 写死在上方常量，env 变量无法覆盖
const ALLOWED_BACKEND_HOSTS = new Set([
  'kydmccknlbpczeqppbtc.supabase.co'
]);
function assertSafeUrl(u, opts) {
  const allowHosts = opts && opts.allowHome ? new Set([...ALLOWED_BACKEND_HOSTS, new URL(HOST_URL).hostname]) : ALLOWED_BACKEND_HOSTS;
  let parsed;
  try { parsed = new URL(u); } catch (e) { throw new Error('非法 URL: ' + u); }
  if (parsed.protocol !== 'https:') throw new Error('不允许的协议: ' + parsed.protocol);
  if (!allowHosts.has(parsed.hostname)) throw new Error('不允许的 host: ' + parsed.hostname);
  return parsed;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    return fallback !== undefined ? fallback : null;
  }
}

function apiHeaders(anonKey, adminKey) {
  const h = { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey, 'Content-Type': 'application/json' };
  if (adminKey) h['x-admin-key'] = adminKey;
  return h;
}

async function fetchJSON(url, headers) {
  assertSafeUrl(url); // SSRF 防护：调用前校验 host 白名单
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  return res.json();
}

// SSRF 防护专用封装：调用前 assertSafeUrl 已通过 host 白名单校验
async function safeFetch(url, opts) {
  const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(30000) }, opts || {}));
  return res;
}

(async () => {
  const site = readJson('site.json', {});
  const sb = (site.comments && site.comments.url || '').replace(/\/+$/, '');
  const anonKey = (site.comments && site.comments.anonKey) || '';
  const adminKey = process.env.ADMIN_KEY || '';
  const maxKeep = parseInt(process.env.BACKUP_KEEP || '30', 10);

  const report = { at: new Date().toISOString(), ok: true, home: null, supabase: null, backup: null, errors: [] };

  try {
    assertSafeUrl(HOST_URL, { allowHome: true }); // SSRF 防护：URL 写死，校验 host 白名单
    const homeRes = await safeFetch(HOST_URL); // 通过 safeFetch 包装统一拦截
    report.home = homeRes.status;
    if (homeRes.status !== 200) throw new Error('首页返回 ' + homeRes.status);
  } catch (e) {
    report.ok = false;
    report.errors.push('首页检查失败：' + (e.message || e));
  }

  let data = null;
  if (sb && anonKey) {
    try {
      const tables = {};
      const comments = await fetchJSON(sb + '/rest/v1/comments?select=*&order=created_at.asc', apiHeaders(anonKey, adminKey));
      tables.comments = { count: comments.length, rows: comments };
      if (adminKey) {
        const views = await fetchJSON(sb + '/rest/v1/page_views?select=*&order=page_viewed_at.asc&limit=50000', apiHeaders(anonKey, adminKey));
        tables.page_views = { count: views.length, rows: views };
        try {
          const daily = await fetchJSON(sb + '/rest/v1/daily_page_views?select=*&order=view_day.asc&limit=50000', apiHeaders(anonKey, adminKey));
          tables.daily_page_views = { count: daily.length, rows: daily };
        } catch (e) {
          tables.daily_page_views = { count: 0, rows: [], note: (e.message || e) };
        }
      }
      data = tables;
      report.supabase = 'ok';
      report.backup = Object.keys(data).reduce((o, k) => (o[k] = data[k].count, o), {});
    } catch (e) {
      report.ok = false;
      report.errors.push('Supabase 备份失败：' + (e.message || e));
      report.supabase = 'fail';
    }
  } else {
    report.errors.push('未配置 site.json 中的 comments.url/anonKey，跳过评论备份');
  }

  if (data) {
    const day = new Date().toISOString().slice(0, 10);
    // 路径穿越防护：day 必须是 ISO 日期格式（YYYY-MM-DD），不接受任何外部输入
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('非法 day 格式: ' + day);
    const dir = path.join('backup', day);
    if (path.resolve(dir).indexOf(path.resolve('backup') + path.sep) !== 0) throw new Error('day 解析后路径越界: ' + day);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, tbl] of Object.entries(data)) {
      fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(tbl, null, 2));
    }
    fs.writeFileSync(path.join(dir, '_report.json'), JSON.stringify(report, null, 2));

    const roots = fs.readdirSync('backup').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const d of roots.slice(maxKeep)) {
      fs.rmSync(path.join('backup', d), { recursive: true, force: true });
    }
  }

  fs.writeFileSync('backup/health.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error('备份/检查脚本异常：' + (e && e.message || e)); try { fs.writeFileSync('backup/health.json', JSON.stringify({ ok: false, errors: [String(e && e.message || e)] })); } catch (e2) {} });