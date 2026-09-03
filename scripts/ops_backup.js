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

// SECURITY: 路径穿越防护——所有 path.join 都走这里，禁止直接拼接用户输入
// 实现：先用 path.resolve 把 ../ 归一化掉，再校验最终路径必须在 base 之内
function safeJoin(base, name, pattern) {
  if (!pattern.test(String(name))) throw new Error('非法路径段: ' + name);
  const rootResolved = path.resolve(base);
  const target = path.resolve(rootResolved, name);
  const allowed = rootResolved + path.sep;
  if (target !== rootResolved && target.startsWith(allowed) === false) throw new Error('路径越界: ' + name);
  return target;
}

function apiHeaders(anonKey, adminKey) {
  const h = { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey, 'Content-Type': 'application/json' };
  if (adminKey) h['x-admin-key'] = adminKey;
  return h;
}

// SECURITY: SSRF 防护封装——所有出网请求都走 safeFetch，禁止裸 fetch
async function safeFetch(url, opts) {
  assertSafeUrl(url);
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
    assertSafeUrl(sb);
    // SECURITY: SSRF 防护——所有出网路径必须以 /rest/v1/ 开头，且显式 URL 解析校验
    const REST_PREFIX = '/rest/v1/';
    // SECURITY: headers 在包装内构造，外部不传，避免外部变量流入出网参数
    function supabaseFetch(restPath) {
      if (!restPath.startsWith(REST_PREFIX)) throw new Error('非 Supabase REST 路径: ' + restPath);
      const u = new URL(sb + restPath); // 显式 URL 解析
      if (u.protocol !== 'https:') throw new Error('非 https 协议');
      if (!ALLOWED_BACKEND_HOSTS.has(u.hostname)) throw new Error('host 不在白名单: ' + u.hostname);
      const headers = { 'apikey': anonKey, 'Authorization': 'Bearer ' + anonKey, 'Content-Type': 'application/json' };
      if (adminKey) headers['x-admin-key'] = adminKey;
      return safeFetch(u.toString(), { headers });
    }
    try {
      const tables = {};
      const commentsRes = await supabaseFetch('/rest/v1/comments?select=*&order=created_at.asc');
      if (!commentsRes.ok) throw new Error('HTTP ' + commentsRes.status);
      const comments = await commentsRes.json();
      tables.comments = { count: comments.length, rows: comments };
      if (adminKey) {
        const views = await supabaseFetch('/rest/v1/page_views?select=*&order=page_viewed_at.asc&limit=50000');
        if (views.ok) { const j = await views.json(); tables.page_views = { count: j.length, rows: j }; }
        try {
          const daily = await supabaseFetch('/rest/v1/daily_page_views?select=*&order=view_day.asc&limit=50000');
          if (daily.ok) { const j = await daily.json(); tables.daily_page_views = { count: j.length, rows: j }; }
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
    // SECURITY: 走 safeJoin，day 已 ISO 格式校验 + 路径边界校验
    const dir = safeJoin('backup', day, /^\d{4}-\d{2}-\d{2}$/);
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, tbl] of Object.entries(data)) {
      // SECURITY: name 是表名（comments/page_views/daily_page_views/_report），固定白名单
      const safeName = safeJoin(dir, name, /^[a-zA-Z0-9_]+$/);
      fs.writeFileSync(safeName + '.json', JSON.stringify(tbl, null, 2));
    }
    fs.writeFileSync(path.join(dir, '_report.json'), JSON.stringify(report, null, 2));

    const roots = fs.readdirSync('backup').filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().reverse();
    for (const d of roots.slice(maxKeep)) {
      fs.rmSync(safeJoin('backup', d, /^\d{4}-\d{2}-\d{2}$/), { recursive: true, force: true });
    }
  }

  fs.writeFileSync('backup/health.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(e => { console.error('备份/检查脚本异常：' + (e && e.message || e)); try { fs.writeFileSync('backup/health.json', JSON.stringify({ ok: false, errors: [String(e && e.message || e)] })); } catch (e2) {} });