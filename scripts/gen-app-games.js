#!/usr/bin/env node
/**
 * 由帖子 HTML 生成 APP 用的 app-games.json（只读页面、只写这一个文件）
 * 字段契约见 mrhyfx-app/README.md：
 *   { games: [{ id,title,cover,platform,size,tags,intro,linkPc,linkMobile,code,date }] }
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'app-games.json');
const EXCLUDE = new Set([
  'index.html', 'Tsinhoht.html', 'guide.html', 'tutorial.html', 'tools.html',
  '404.html', 'mianze.html', 'sponsor.html', 'email-preview.html', 'site-preview.html',
  'comments-preview.html', 'search.html', 'template-skeleton.html'
]);

function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h % 2000000000;
}
function strip(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function dateOf(file) {
  const k = String(file).replace(/\.html$/i, '');
  let m = /^(\d{4})(\d{2})(\d{2})/.exec(k);          // 20261023
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = /^(\d{4})(\d)(\d{2})$/.exec(k);                 // 2026825 → 2026-08-25
  if (m) return `${m[1]}-0${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})/.exec(k);                // 8.10 → 2026-08-10
  if (m && +m[1] >= 1 && +m[1] <= 12) {
    return `2026-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  }
  return '';
}

function parseBlock(block, file, seq) {
  const titleM = /<div class="content mm-editor"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(block);
  const title = strip(titleM ? titleM[1] : '');
  if (!title) return null;

  // 一个游戏块里可能有多张图：第一张当封面，其余当截图
  const all = [];
  const fullRe = /data-full="([^"]+)"/g;
  let fm;
  while ((fm = fullRe.exec(block))) all.push(fm[1]);
  if (!all.length) {
    const srcRe = /<img[^>]+src="([^"]+)"/g;
    while ((fm = srcRe.exec(block))) all.push(fm[1]);
  }
  const cover = all[0] || '';
  if (!cover) return null;
  const shots = [...new Set(all.slice(1))].slice(0, 8);

  const platM = /mrhx-plat-cover">([^<]*)</.exec(block);
  const platform = strip(platM ? platM[1] : '');

  const links = [];
  const re = /<a[^>]+class="[^"]*mrhx-btn[^"]*"[^>]*href="([^"]+)"/g;
  let m;
  while ((m = re.exec(block))) if (m[1] && !/^javascript:/i.test(m[1])) links.push(m[1]);

  const noteM = /<div class="note mm-editor"[^>]*>([\s\S]*?)<\/div>/.exec(block);
  const note = strip(noteM ? noteM[1] : '');

  const tags = [];
  const bracketRe = /【([^】]+)】/g;
  let bm;
  while ((bm = bracketRe.exec(note))) {
    bm[1].split(/[\/／、,，]/).map(x => x.trim()).filter(Boolean).forEach(t => {
      if (/^\d/.test(t)) return;
      if (t.length > 10) return;
      if (/^[A-Z]\d+$/.test(t)) return;
      if (/\d+(?:\.\d+)?\s*[GMT]B?/i.test(t)) return;
      if (t === '简介' || /^(PC|安卓|手机|双端)/.test(t)) return;
      tags.push(t);
    });
  }
  const sizeM = /(\d+(?:\.\d+)?)\s*([GMT])B?(?![A-Za-z])/i.exec(note);
  const size = sizeM ? sizeM[1] + sizeM[2].toUpperCase() : '';

  const codeM = /解压码[：:]\s*([^\s<【]+)/.exec(block);
  const code = codeM ? strip(codeM[1]) : '';

  return {
    id: hashId(file + '|' + title + '|' + seq),
    title,
    cover,
    platform,
    size,
    tags: [...new Set(tags)].slice(0, 6),
    intro: (note || title).slice(0, 1200),
    linkPc: links[0] || '',
    linkMobile: links[1] || links[0] || '',
    code,
    shots,
    source: file === 'qzt.html' ? 'qzt' : 'post',
    page: file.replace(/\.html$/i, ''),
    date: dateOf(file)
  };
}

async function main() {
  let ts = {};
  try { ts = JSON.parse(fs.readFileSync(path.join(ROOT, 'timestamps.json'), 'utf8')); } catch (e) {}
  const timeOf = f => {
    if (f === 'qzt.html') return 0;   // 求助帖无发布时间，排序交给「首次收录日期」
    const k = f.replace(/\.html$/i, '');
    const v = ts[k];
    let t = v ? Date.parse(v) : NaN;
    if (isNaN(t)) {
      const m = /^(\d{4})(\d{1,2})(\d{2})/.exec(k);
      if (m) t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    }
    return isNaN(t) ? 0 : t;
  };
  const files = fs.readdirSync(ROOT)
    .filter(f => /\.html$/i.test(f) && !EXCLUDE.has(f))
    // 跳过 _ 开头的草稿/demo/备份页（_demo_app游戏库_v6.html 这类），
    // 否则 demo 里的示例卡会被当成真实游戏灌进 APP（2026-11-24 实测多算 175 条）
    // 只认「数字开头的帖子页」（20261023pc.html / 8.10.html）+ 求助帖 qzt.html；
    // 原型页与 _demo_* 一律不进（2026-11-24 实测它们会多算 175 条）
    .filter(f => /^\d/.test(f) || f === 'qzt.html')
    .sort((a, b) => (timeOf(b) - timeOf(a)) || (a < b ? 1 : -1));

  const games = [];
  for (const file of files) {
    let html;
    try { html = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch (e) { continue; }
    if (html.indexOf('class="node heading3') < 0) continue;
    const parts = html.split(/(?=<li class="node heading3)/).slice(1);
    for (const p of parts) {
      const g = parseBlock(p, file, games.length);
      if (!g) continue;
      // 不去重：同一游戏的不同版本（甚至同名不同版）都要保留
      g.uid = file.replace(/\.html$/i, '') + '#' + games.length;
      games.push(g);
    }
  }

  // ★「最新游戏」= 首次被收录的日期。每次生成时比对上一次的 app-added.json：
  //   没见过的键 → 记今天（新帖/帖子里新加的游戏自然排到最前）；见过的 → 保留首次日期。
  const today = new Date().toISOString().slice(0, 10);
  const ADDED = path.join(ROOT, 'app-added.json');
  let added = {};
  try { added = JSON.parse(fs.readFileSync(ADDED, 'utf8')); } catch (e) {}
  let qztSeq = 0;
  for (const g of games) {
    const key = g.page + '|' + g.title;
    const isQztHead = g.page === 'qzt' && (qztSeq++ < 15);
    if (!added[key]) {
      // 首次建立基线：正式帖用帖子日期，求助帖没有日期 → 统一压到 30 天前，避免 262 条同时挤到最前
      const base = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
      // 求助帖没有单条时间：首次把前 15 条当作「最近加的」，其余压到基线之后
      added[key] = isQztHead ? today : ((g.page === 'qzt' || !g.date) ? base : g.date);
    }
    g.date = added[key];
  }
  fs.writeFileSync(ADDED, JSON.stringify(added) + '\n');
  // 稳定排序：日期新的在前，同一天保持原顺序（帖子内顺序即发布顺序）
  games.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const updated = new Date().toISOString();
  // 列表只留轻量字段（不含长文本），详情走 app-details/<页面>.json 分片
  const light = games.map(g => ({
    id: g.id, title: g.title, cover: g.cover, platform: g.platform,
    size: g.size, tags: g.tags, date: g.date, source: g.source, page: g.page,
  }));
  const payload = { updated, count: light.length, games: light };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');

  // 分片：一个帖子一个文件，点进详情才拉
  const dir = path.join(ROOT, 'app-details');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const byPage = {};
  for (const g of games) (byPage[g.page] = byPage[g.page] || []).push({
    id: g.id, intro: g.intro, code: g.code, linkPc: g.linkPc, linkMobile: g.linkMobile, shots: g.shots,
  });
  for (const page of Object.keys(byPage)) {
    fs.writeFileSync(path.join(dir, page + '.json'), JSON.stringify(byPage[page]) + '\n');
  }
  // 轻量清单：APP 每次启动只拉这个（几百字节），变了才下载 8MB 的正文
  fs.writeFileSync(path.join(ROOT, 'app-version.json'),
    JSON.stringify({ updated, count: games.length }, null, 2) + '\n');
  console.log('app-games.json ok, games:', games.length);
  await buildHot();
  if (games.length) console.log('sample:', JSON.stringify(games[0]).slice(0, 300));
}

// 热门：按站点下载点击量聚合，产出 app-hot.json（失败不影响主流程）
async function buildHot() {
  const base = 'https://kydmccknlbpczeqppbtc.supabase.co';
  const key = 'sb_publishable_OfNqFNohTdrmzZ8dtu5bZQ_LcTk5iF9';
  const rows = [];
  try {
    for (let off = 0; off < 20000; off += 1000) {
      const res = await fetch(base + '/rest/v1/download_clicks?select=game_name&limit=1000&offset=' + off, {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
      });
      if (!res.ok) break;
      const part = await res.json();
      rows.push(...part);
      if (part.length < 1000) break;
    }
  } catch (e) {
    console.warn('[hot] 拉取失败，跳过：', e.message);
    return;
  }
  const c = {};
  for (const r of rows) {
    const n = String(r.game_name || '').trim();
    if (n) c[n] = (c[n] || 0) + 1;
  }
  const items = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 60)
    .map(([name, count]) => ({ name, count }));
  fs.writeFileSync(path.join(ROOT, 'app-hot.json'),
    JSON.stringify({ updated: new Date().toISOString(), items }, null, 1) + '\n');
  console.log('app-hot.json ok, top:', items.length);
}

main().catch(e => { console.error(e); process.exit(1); });
