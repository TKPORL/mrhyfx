/**
 * cf_worker.js — Tsinho黄油站 数据服务 v2（评论/点赞/浏览量/下载点击/后台管理）
 *
 * v2（2026-10-10 双写容灾 + 聚合上报）：
 *   - 主库 D1，备用 Supabase：GET 读 D1，失败/超时(3s)自动改读 Supabase（响应头 X-Data-Source 标注）
 *   - 写入：先写 D1，成功后异步镜像到 Supabase（内容类=评论 立即镜像；计数类=聚合一波后带 D1 终值镜像）
 *   - 聚合：浏览/点击类写入先进内存缓冲，满 50 条或距首批超 60 秒才落一次库（写行数降 ~95%）
 *     —— 后台数字最多延迟 1 分钟，真实不丢失（Worker 实例意外重启只丢缓冲窗口内一小撮计数）
 *   - adminImport 修复：download_clicks 兼容 post_url/game_name/link_url（Supabase 原字段名）与 path/label/url 两种行格式
 *
 * 兼容 Supabase REST 子集：comments.js / track.js / 两站后台几乎零改动，只换 sb 域名。
 * 支持：GET  /rest/v1/{comments,page_views,game_likes,daily_page_views,download_clicks}
 *       POST /rest/v1/download_clicks（下载点击上报，track.js 直插）
 *       POST /rest/v1/rpc/{guard_comment,inc_page_view,inc_daily_view,inc_game_like,admin_reply_comment,admin_delete_comment,admin_pin_comment}
 *       POST /v1/admin/import（批量导数）
 *       scheduled：每天汇总 daily_snapshots
 *
 * 绑定：Settings → Variables and Secrets
 *   DB            D1 数据库绑定（tsinho-data）
 *   ADMIN_TOKENS  逗号分隔的管理 Token 明文（Worker 内比对，不进前端）
 *   VISITOR_SALT  访客指纹盐（随机字符串）
 *   ALLOWED_ORIGINS 逗号分隔，如 https://tkporl.github.io（同域两站共用）
 *   SITE_PREFIX_B 备用站前缀，如 /hyfxdyx/
 *   SUPABASE_URL      备用端地址，如 https://xxxx.supabase.co（不配则镜像自动跳过）
 *   SUPABASE_ANON_KEY 备用端公开 anon key
 */

const JSONH = { 'Content-Type': 'application/json;charset=UTF-8' };
const LIMIT_MAX = 1000;
const TABLES = ['comments', 'page_views', 'game_likes', 'daily_page_views', 'download_clicks', 'daily_snapshots'];
// 公共 GET 不返回的字段（隐私）
const PRIVATE_FIELDS = { comments: ['email'] };
// D1 挂了才判定为「可降级」的错误（业务错误如限频/Token 无效不许降级）
const D1_DOWN = /D1_ERROR|INTERNAL|NETWORK|TIMEOUT|EXCEEDED|UNAVAILABLE|disconnected/i;

function json(data, status = 200, cacheSec = 0) {
  const h = { ...JSONH };
  if (cacheSec > 0) h['Cache-Control'] = 'public, max-age=' + cacheSec;
  return new Response(JSON.stringify(data), { status, headers: h });
}
function esc(s) { return String(s == null ? '' : s); }
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function bjDay() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10); }
function bjNow() { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' '); }
// Workers 模块格式里 env/ctx 在参数上；这里用闭包转发
let ENVREF = null, CTXREF = null;

function corsBase(request) {
  const o = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  const allow = String((ENVREF && ENVREF.ALLOWED_ORIGINS) || '').split(',').map(s => s.trim().replace(/\/+$/, ''));
  const headers = { ...JSONH };
  if (o && allow.includes(o)) headers['Access-Control-Allow-Origin'] = o;
  headers['Access-Control-Allow-Headers'] = 'Content-Type, apikey, Authorization, X-Admin-Token, X-Admin-Key, Prefer, Range';
  headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
  // 前端要读 Content-Range（评论总数），不暴露的话浏览器 JS 拿不到
  headers['Access-Control-Expose-Headers'] = 'Content-Range, X-Data-Source';
  return headers;
}
function jok(data, status = 200) { return jres(data, status); }
let LASTREQ = null;
function jheaders(data, status, cacheSec, extra) {
  const request = LASTREQ;
  const o = (request.headers.get('Origin') || '').replace(/\/+$/, '');
  const allow = String((ENVREF && ENVREF.ALLOWED_ORIGINS) || '').split(',').map(s => s.trim().replace(/\/+$/, ''));
  const h = { ...JSONH, ...(extra || {}) };
  if (o && allow.includes(o)) { h['Access-Control-Allow-Origin'] = o; h['Vary'] = 'Origin'; }
  if (cacheSec > 0) h['Cache-Control'] = 'public, max-age=' + cacheSec;
  return h;
}
function jres(data, status = 200, cacheSec = 0, extra) {
  return new Response(JSON.stringify(data), { status, headers: jheaders(data, status, cacheSec, extra) });
}
function jerr(msg, status = 400) { return jres({ message: msg }, status); }

async function adminOk(request, env, bodyToken) {
  const cand = [request.headers.get('X-Admin-Token') || '', bodyToken || ''];
  const list = String(env.ADMIN_TOKENS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return false;
  for (const c of cand) {
    if (!c) continue;
    const h = await sha256hex(c);
    for (const t of list) if ((await sha256hex(t)) === h) return true;
  }
  return false;
}
function visitorHash(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
  const ua = request.headers.get('User-Agent') || '';
  return sha256hex(ip + '|' + ua + '|' + (env.VISITOR_SALT || 'salt'));
}

/* ---------- Supabase 镜像（备用端）：所有镜像均为 fire-and-forget，失败只记日志 ---------- */
function sbReady() { return !!(ENVREF && ENVREF.SUPABASE_URL && ENVREF.SUPABASE_ANON_KEY); }
function sbBase() { return String(ENVREF.SUPABASE_URL).replace(/\/+$/, ''); }
function sbHeaders(merge) {
  const k = ENVREF.SUPABASE_ANON_KEY;
  return { 'Content-Type': 'application/json', apikey: k, Authorization: 'Bearer ' + k,
    Prefer: (merge ? 'resolution=merge-duplicates,' : '') + 'return=minimal' };
}
async function sbSend(path, body, merge) {
  if (!sbReady()) return;
  try {
    const r = await fetch(sbBase() + path, { method: 'POST', headers: sbHeaders(merge), body: JSON.stringify(body) });
    if (!r.ok) console.log('[sb-mirror] ', path, r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.log('[sb-mirror] ', path, String(e).slice(0, 120)); }
}
// Supabase 端可能因 RLS 拒绝带 id 的匿名插入；失败则去掉 id 重试一次（id 不一致只影响精确对账，不影响展示）
async function sbInsertComment(c) {
  if (!sbReady()) return;
  const row = { id: c.id, url: c.url, pid: c.pid || null, nick: c.nick, email: c.email || '',
    content: c.content, is_admin: !!c.is_admin, pinned: !!c.pinned, replied: !!c.replied, created_at: c.created_at };
  try {
    let r = await fetch(sbBase() + '/rest/v1/comments', { method: 'POST', headers: sbHeaders(false), body: JSON.stringify(row) });
    if (!r.ok && (r.status === 403 || r.status === 400)) {
      delete row.id;
      r = await fetch(sbBase() + '/rest/v1/comments', { method: 'POST', headers: sbHeaders(false), body: JSON.stringify(row) });
    }
    if (!r.ok) console.log('[sb-mirror] comments', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.log('[sb-mirror] comments', String(e).slice(0, 120)); }
}

/* ---------- 聚合缓冲：浏览/点击类写入先攒一批，满 50 条或 60 秒落一次库 ---------- */
const AGG = { pv: new Map(), dv: new Map(), clicks: [], since: 0, timerSet: false };
function aggTouch() { if (!AGG.since) AGG.since = Date.now(); aggSchedule(); }
function aggSize() { return AGG.pv.size + AGG.dv.size + AGG.clicks.length; }
function aggSchedule() {
  if (AGG.timerSet || !CTXREF) return;
  AGG.timerSet = true;
  CTXREF.waitUntil((async () => {
    await new Promise(r => setTimeout(r, 25000)); // waitUntil 上限 30s，25s 落一次盘
    AGG.timerSet = false;
    try { await aggFlush(ENVREF); } catch (e) { console.log('[agg-flush]', String(e).slice(0, 120)); }
  })());
}
async function aggFlush(env) {
  if (!aggSize()) return;
  const mirrors = [];
  // 页面浏览：D1 累加，取回终值镜像给 Supabase（Supabase REST 不能做自增，直接覆盖成 D1 终值，两边最终一致）
  for (const [url, n] of AGG.pv) {
    const r = await env.DB.prepare('INSERT INTO page_views(url,count) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET count=count+excluded.count RETURNING count').bind(url, n).first();
    mirrors.push(['/rest/v1/page_views', { url, count: r ? r.count : n }, true]);
  }
  for (const [key, n] of AGG.dv) {
    const i = key.indexOf('|'), day = key.slice(0, i), url = key.slice(i + 1);
    const r = await env.DB.prepare('INSERT INTO daily_page_views(day,url,count) VALUES(?,?,?) ON CONFLICT(day,url) DO UPDATE SET count=count+excluded.count RETURNING count').bind(day, url, n).first();
    mirrors.push(['/rest/v1/daily_page_views', { day, url, count: r ? r.count : n }, true]);
  }
  for (const c of AGG.clicks) {
    await env.DB.prepare('INSERT INTO download_clicks(path,label,url,created_at) VALUES(?,?,?,?)')
      .bind(esc(c.post_url || c.path || '').slice(0, 300), esc(c.game_name || c.label || '').slice(0, 200),
        esc(c.link_url || c.url || '').slice(0, 500), esc(c.created_at || bjNow())).run();
    mirrors.push(['/rest/v1/download_clicks', { post_url: c.post_url || c.path || '', game_name: c.game_name || c.label || '',
      link_url: c.link_url || c.url || '', link_type: c.link_type || '', created_at: c.created_at || bjNow() }, false]);
  }
  await env.DB.batch([]).catch(() => {}); // 占位：保持与旧版行为一致（无批量语句时 no-op）
  const done = { pv: AGG.pv.size, dv: AGG.dv.size, clicks: AGG.clicks.length };
  AGG.pv.clear(); AGG.dv.clear(); AGG.clicks = []; AGG.since = 0;
  if (CTXREF) CTXREF.waitUntil(Promise.all(mirrors.map(([p, b, m]) => sbSend(p, b, m))));
  else mirrors.forEach(([p, b, m]) => sbSend(p, b, m));
  console.log('[agg-flush] ok', JSON.stringify(done));
}

/* ---------- PostgREST 风格 query 解析（兼容层核心） ---------- */
function parsePGQ(url) {
  const q = {};
  url.searchParams.forEach((v, k) => { q[k] = v; });
  const filters = {};
  const reserved = ['select', 'order', 'limit', 'offset', 'apikey', 'authorization'];
  for (const k in q) {
    if (reserved.includes(k)) continue;
    const m = /^(eq|like)\.(.*)$/.exec(q[k]);
    if (m) filters[k] = { op: m[1], val: m[2] };
  }
  // 2026-10-15 修复：多字段排序（如 comments 的 pinned.desc,created_at.desc）。
  //   旧写法 split('.')[0] 只剩第一个字段名，时间排序被丢掉 → 求助帖首屏 20 条变成「置顶+最旧」。
  //   字段名必须匹配白名单正则才拼进 SQL（防注入）。
  const orderBy = parseOrder(q.order);
  const limit = Math.min(parseInt(q.limit || '1000', 10) || 1000, LIMIT_MAX);
  const offset = parseInt(q.offset || '0', 10) || 0;
  return { filters, orderBy, limit, offset };
}
function parseOrder(raw) {
  if (!raw) return '';
  const segs = [];
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
  for (const p of parts) {
    const f = p.split('.')[0];
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(f)) continue; // 非法字段名直接丢弃
    segs.push(f + (/\.desc/i.test(p) ? ' DESC' : ' ASC'));
  }
  return segs.length ? ' ORDER BY ' + segs.join(', ') : '';
}
function buildWhere(filters, args) {
  const conds = [], params = [];
  for (const f in filters) {
    const { op, val } = filters[f];
    if (op === 'eq') { conds.push(`${f} = ?`); params.push(val); }
    else { conds.push(`${f} LIKE ?`); params.push(val.replace(/\*/g, '%')); }
  }
  args.push(...params);
  return conds.length ? ' WHERE ' + conds.join(' AND ') : '';
}
function stripPrivate(table, rows) {
  const priv = PRIVATE_FIELDS[table];
  return priv ? rows.map(r => { const c = { ...r }; priv.forEach(f => delete c[f]); return c; }) : rows;
}
async function sbFallbackList(request, table) {
  // D1 挂了：原样透传查询到 Supabase，隐私字段照剥
  const u = new URL(request.url);
  const r = await fetch(sbBase() + u.pathname + u.search, { headers: { apikey: ENVREF.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + ENVREF.SUPABASE_ANON_KEY } });
  if (!r.ok) return jerr('upstream ' + r.status, 502);
  let rows = await r.json();
  const isAdmin = await adminOk(request, ENVREF);
  if (!isAdmin) rows = stripPrivate(table, rows);
  return jres(rows, 200, table === 'comments' ? 60 : 0, { 'X-Data-Source': 'supabase-fallback' });
}
async function listTable(request, env, table) {
  const u = new URL(request.url);
  const { filters, orderBy, limit, offset } = parsePGQ(u);
  const args = [];
  const where = buildWhere(filters, args);
  const ob = orderBy;
  let rows;
  try {
    const r1 = await Promise.race([
      env.DB.prepare(`SELECT * FROM ${table}${where}${ob} LIMIT ? OFFSET ?`).bind(...args, limit, offset).all(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('D1 TIMEOUT')), 3000)),
    ]);
    rows = r1.results || [];
  } catch (e) {
    if (sbReady() && D1_DOWN.test(String(e.message || e) + ' D1_ERROR TIMEOUT')) return await sbFallbackList(request, table);
    throw e;
  }
  const isAdmin = await adminOk(request, env);
  if (!isAdmin) rows = stripPrivate(table, rows);
  // 2026-10-15：补真实总数（content-range，PostgREST 兼容形状 0-{页长-1}/{总数}）。
  //   comments.js 靠它显示「共 N 条」并判断还有没有下一页——分页化之后没有它只能显示已加载数。
  let extra;
  try {
    const c = await env.DB.prepare(`SELECT COUNT(*) n FROM ${table}${where}`).bind(...args).first();
    extra = { 'Content-Range': '0-' + Math.max(0, (rows.length || 1) - 1) + '/' + (c.n || 0) };
  } catch (e) { /* 总数拿不到不影响列表 */ }
  return jres(rows, 200, table === 'comments' ? 60 : 0, extra);
}

/* ---------- RPC 实现 ---------- */
async function rpc(name, body, request, env) {
  const b = body || {};
  if (name === 'guard_comment') {
    const url = esc(b.p_url || '').slice(0, 200), nick = esc(b.p_nick || '匿名').slice(0, 30),
      email = esc(b.p_email || '').slice(0, 120), content = esc(b.p_content || '').trim().slice(0, 2000),
      pid = b.p_pid ? esc(b.p_pid) : null;
    if (!url || !content) throw new Error('参数缺失');
    // 限频：同访客每分钟 1 条
    const vh = visitorHash(request, env), minute = bjNow().slice(0, 16);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO comment_rate(ip,minute) VALUES(?,?)').bind(vh, minute).run();
    if (!ins.meta || !ins.meta.changes) throw new Error('发言太频繁，稍后再试');
    const id = crypto.randomUUID(), created = bjNow();
    await env.DB.prepare('INSERT INTO comments(id,url,pid,nick,email,content,is_admin,pinned,created_at) VALUES(?,?,?,?,?,?,0,0,?)')
      .bind(id, url, pid, nick || '匿名', email, content, created).run();
    await bustCache(request);
    if (CTXREF) CTXREF.waitUntil(sbInsertComment({ id, url, pid, nick: nick || '匿名', email, content, is_admin: 0, pinned: 0, created_at: created }));
    return jok(null, 200);
  }
  if (name === 'inc_page_view') {
    const url = esc(b.p_url || '').slice(0, 200); if (!url) throw new Error('参数缺失');
    AGG.pv.set(url, (AGG.pv.get(url) || 0) + 1); aggTouch();
    return jok(null, 200);
  }
  if (name === 'inc_daily_view') {
    const url = esc(b.p_url || '').slice(0, 200), day = esc(b.p_day || bjDay()).slice(0, 10);
    if (!url) throw new Error('参数缺失');
    const key = day + '|' + url;
    AGG.dv.set(key, (AGG.dv.get(key) || 0) + 1); aggTouch();
    return jok(null, 200);
  }
  if (name === 'inc_game_like') {
    const id = esc(b.p_id || '').slice(0, 200); if (!id) throw new Error('参数缺失');
    const vh = visitorHash(request, env);
    const ins = await env.DB.prepare('INSERT OR IGNORE INTO like_marks(visitor,game_id) VALUES(?,?)').bind(vh, id).run();
    if (!ins.meta || !ins.meta.changes) { // 已赞过：返回当前数，不 +1
      const cur = await env.DB.prepare('SELECT count FROM game_likes WHERE game_id=?').bind(id).first();
      return jres(cur ? cur.count : 0, 200);
    }
    const r = await env.DB.prepare('INSERT INTO game_likes(game_id,count) VALUES(?,1) ON CONFLICT(game_id) DO UPDATE SET count=count+1 RETURNING count').bind(id).first();
    const cnt = r ? r.count : 1;
    if (CTXREF) CTXREF.waitUntil(sbSend('/rest/v1/game_likes', { game_id: id, count: cnt }, true));
    return jres(cnt, 200);
  }
  if (name === 'admin_reply_comment' || name === 'admin_delete_comment' || name === 'admin_pin_comment') {
    if (!(await adminOk(request, env, b.p_token))) throw new Error('TOKEN_INVALID');
    if (name === 'admin_reply_comment') {
      const url = esc(b.p_url || '').slice(0, 200), pid = esc(b.p_pid), content = esc(b.p_content || '').trim().slice(0, 2000),
        nick = (esc(b.p_nick || 'Tsinho').trim() || 'Tsinho').slice(0, 30);
      if (!url || !content) throw new Error('参数缺失');
      const id = crypto.randomUUID(), created = bjNow();
      await env.DB.prepare('INSERT INTO comments(id,url,pid,nick,email,content,is_admin,pinned,created_at) VALUES(?,?,?,?,?,?,1,0,?)')
        .bind(id, url, pid, nick, 'tsinho@users.noreply.github.com', content, created).run();
      await bustCache(request);
      if (CTXREF) CTXREF.waitUntil(sbInsertComment({ id, url, pid, nick, email: 'tsinho@users.noreply.github.com', content, is_admin: 1, pinned: 0, created_at: created }));
      return jok(null, 200);
    }
    if (name === 'admin_delete_comment') {
      const id = esc(b.p_id); if (!id) throw new Error('参数缺失');
      await env.DB.prepare('DELETE FROM comments WHERE id=? OR pid=?').bind(id, id).run();
      await bustCache(request);
      if (CTXREF) CTXREF.waitUntil(sbSend('/rest/v1/rpc/admin_delete_comment', b, false));
      return jok(null, 200);
    }
    const id = esc(b.p_id), pin = b.p_pin ? 1 : 0;
    await env.DB.prepare('UPDATE comments SET pinned=? WHERE id=?').bind(pin, id).run();
    await bustCache(request);
    if (CTXREF) CTXREF.waitUntil(sbSend('/rest/v1/rpc/admin_pin_comment', b, false));
    return jok(null, 200);
  }
  throw new Error('未知 RPC: ' + name);
}

/* ---------- 下载点击上报（track.js 直插 /rest/v1/download_clicks） ---------- */
async function reportClick(request, env) {
  const b = await request.json().catch(() => ({}));
  if (!esc(b.post_url || b.path || '')) throw new Error('参数缺失');
  b.created_at = b.created_at || new Date().toISOString();
  AGG.clicks.push(b); aggTouch();
  return jok(null, 201);
}

/* ---------- 管理：批量导入（浏览器导出的 JSON → POST 到这里） ---------- */
async function adminImport(request, env) {
  if (!(await adminOk(request, env))) throw new Error('TOKEN_INVALID');
  const b = await request.json();
  const table = esc(b.table || '');
  if (!TABLES.includes(table) && table !== 'comments') throw new Error('表不在白名单');
  const rows = Array.isArray(b.rows) ? b.rows : [];
  let done = 0;
  const stmts = [];
  for (const r of rows) {
    if (table === 'comments') {
      stmts.push(env.DB.prepare('INSERT OR IGNORE INTO comments(id,pid,url,nick,email,content,is_admin,pinned,replied,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .bind(esc(r.id), r.pid ? esc(r.pid) : null, esc(r.url), esc(r.nick || '匿名'), esc(r.email || ''), esc(r.content || ''), r.is_admin ? 1 : 0, r.pinned ? 1 : 0, r.replied ? 1 : 0, esc(r.created_at || bjNow())));
    } else if (table === 'game_likes') {
      stmts.push(env.DB.prepare('INSERT INTO game_likes(game_id,count) VALUES(?,?) ON CONFLICT(game_id) DO UPDATE SET count=MAX(count,excluded.count)').bind(esc(r.game_id), Number(r.count) || 0));
    } else if (table === 'page_views') {
      stmts.push(env.DB.prepare('INSERT INTO page_views(url,count) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET count=MAX(count,excluded.count)').bind(esc(r.url), Number(r.count) || 0));
    } else if (table === 'daily_page_views') {
      stmts.push(env.DB.prepare('INSERT INTO daily_page_views(day,url,count) VALUES(?,?,?) ON CONFLICT(day,url) DO UPDATE SET count=MAX(count,excluded.count)').bind(esc(r.day), esc(r.url), Number(r.count) || 0));
    } else if (table === 'download_clicks') {
      // v2 修复：兼容 Supabase 原字段名（post_url/game_name/link_url）与旧导出格式（path/label/url）
      stmts.push(env.DB.prepare('INSERT INTO download_clicks(path,label,url,created_at) VALUES(?,?,?,?)')
        .bind(esc(r.path != null ? r.path : (r.post_url || '')).slice(0, 300),
          esc(r.label != null ? r.label : (r.game_name || '')).slice(0, 200),
          esc(r.url != null ? r.url : (r.link_url || '')).slice(0, 500),
          esc(r.created_at || bjNow())));
    }
    done++;
    if (stmts.length >= 200) { await env.DB.batch(stmts.splice(0, 200)); }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return jres({ table, imported: done }, 200);
}

/* ---------- 缓存失效：POST 后清掉该站点相关 GET 缓存 ---------- */
async function bustCache(request) {
  try {
    const u = new URL(request.url);
    const c = caches.default;
    for (const p of ['/rest/v1/comments', '/rest/v1/page_views', '/rest/v1/game_likes', '/rest/v1/daily_page_views']) {
      const cu = new URL(u.origin + p + '?bust=' + Date.now());
      await c.delete(new Request(cu.toString()));
    }
  } catch (e) { /* 缓存失效失败不影响主流程 */ }
}

/* ---------- Cron：每日快照汇总 ---------- */
async function scheduled(env) {
  const y = new Date(Date.now() + 8 * 3600000 - 86400000).toISOString().slice(0, 10);
  const dv = await env.DB.prepare("SELECT COALESCE(SUM(count),0) s, COUNT(DISTINCT url) n FROM daily_page_views WHERE day=?").bind(y).first();
  const cm = await env.DB.prepare("SELECT COUNT(*) n FROM comments WHERE substr(created_at,1,10)=?").bind(y).first();
  const dl = await env.DB.prepare("SELECT COUNT(*) n FROM download_clicks WHERE substr(created_at,1,10)=?").bind(y).first();
  const pv = await env.DB.prepare('SELECT COALESCE(SUM(count),0) s FROM page_views').first();
  await env.DB.prepare(`INSERT INTO daily_snapshots(day,total_views,total_posts,avg_views,today_views,today_comments,today_downloads,created_at)
    VALUES(?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT(day) DO UPDATE SET total_views=excluded.total_views, total_posts=excluded.total_posts, avg_views=excluded.avg_views,
    today_views=excluded.today_views, today_comments=excluded.today_comments, today_downloads=excluded.today_downloads, created_at=datetime('now')`)
    .bind(y, pv.s || 0, dv.n || 0, (dv.n ? Math.round((pv.s || 0) / dv.n) : 0), dv.s || 0, cm.n || 0, dl.n || 0).run();
  return { day: y, done: true };
}

/* ---------- 主入口 ---------- */
export default {
  async fetch(request, env, ctx) {
    ENVREF = env; CTXREF = ctx;
    const url = new URL(request.url);
    LASTREQ = request;
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsBase(request) });
      // 聚合落盘检查：缓冲满 50 条 或 首条进缓冲已超 60 秒，就先落库再处理本次请求
      if (aggSize() && (aggSize() >= 50 || Date.now() - AGG.since > 60000)) await aggFlush(env);
      if (request.method === 'GET' && url.pathname === '/') return jres({ ok: true, service: 'tsinho-data', sbMirror: sbReady() }, 200);
      const m = /^\/rest\/v1\/rpc\/([\w]+)$/.exec(url.pathname);
      if (request.method === 'POST' && m) {
        const body = await request.json().catch(() => ({}));
        try {
          return await rpc(m[1], body, request, env);
        } catch (e) {
          // D1 写入不可用且配置了备用端：写请求直接落到 Supabase（内容不丢，回头对账补齐 D1）
          if (sbReady() && D1_DOWN.test(String(e.message || e))) {
            await fetch(sbBase() + '/rest/v1/rpc/' + m[1], { method: 'POST', headers: sbHeaders(false), body: JSON.stringify(body) });
            return jok(null, 200);
          }
          throw e;
        }
      }
      if (request.method === 'GET') {
        const t = /^\/rest\/v1\/([\w]+)$/.exec(url.pathname);
        if (t && TABLES.includes(t[1])) return await listTable(request, env, t[1]);
      }
      if (request.method === 'POST' && url.pathname === '/rest/v1/download_clicks') return await reportClick(request, env);
      if (request.method === 'POST' && url.pathname === '/v1/admin/import') return await adminImport(request, env);
      if (request.method === 'GET' && url.pathname === '/v1/admin/health') {
        if (!(await adminOk(request, env))) return jerr('TOKEN_INVALID', 401);
        const c = await env.DB.prepare('SELECT COUNT(*) n FROM comments').first();
        return jres({ ok: true, comments: c.n, sbMirror: sbReady() }, 200);
      }
      return jerr('Not Found: ' + url.pathname, 404);
    } catch (e) {
      const msg = String(e.message || e);
      return jres({ message: msg }, /TOKEN_INVALID/.test(msg) ? 401 : 400);
    }
  },
  async scheduled(event, env, ctx) {
    ENVREF = env; CTXREF = ctx;
    ctx.waitUntil(scheduled(env));
  }
};
