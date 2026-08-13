const fs = require('fs');
const path = require('path');

const HOST_URL = process.env.SITE_URL || 'https://tkporl.github.io/mrhyfx/';

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
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);
  return res.json();
}

(async () => {
  const site = readJson('site.json', {});
  const sb = (site.comments && site.comments.url || '').replace(/\/+$/, '');
  const anonKey = (site.comments && site.comments.anonKey) || '';
  const adminKey = process.env.ADMIN_KEY || '';
  const maxKeep = parseInt(process.env.BACKUP_KEEP || '30', 10);

  const report = { at: new Date().toISOString(), ok: true, home: null, supabase: null, backup: null, errors: [] };

  try {
    const home = await fetch(HOST_URL, { signal: AbortSignal.timeout(30000) });
    report.home = home.status;
    if (home.status !== 200) throw new Error('首页返回 ' + home.status);
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
    const dir = path.join('backup', day);
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