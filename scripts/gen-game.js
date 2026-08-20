const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let SITE = {};
if (fs.existsSync('site.json')) {
  const s = JSON.parse(fs.readFileSync('site.json', 'utf8').replace(/^\uFEFF/, ''));
  SITE = { site: s.site || {}, comments: s.comments || {}, nav: s.nav || [] };
}
const SITE_NAME = (SITE.site && SITE.site.name) || 'Tsinho黄油推荐站';
const SITE_LOGO_EM = (SITE.site && SITE.site.logoEm) || '分享';
const SITE_FOOTER = (SITE.site && SITE.site.footer !== undefined) ? SITE.site.footer : 'by Tsinho 发布 · 本站仅供学习交流，请于下载后 24 小时内删除，支持正版';
const _cUrl = (SITE.comments && SITE.comments.enabled && SITE.comments.url) ? SITE.comments.url.replace(/\/+$/, '') : '';
const _cAnon = (SITE.comments && SITE.comments.enabled && SITE.comments.anonKey) ? SITE.comments.anonKey : '';
const CDN_URL = 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main';
const ASSET_REL = 'assets/game/';

const POST_DIR = 'posts';
const posts = fs.readdirSync(POST_DIR).filter(f => /\.html$/i.test(f) && !['index.html', 'publish.html', 'Tsinhoht.html', 'search.html', 'email-preview.html', 'comments-preview.html', 'site-preview.html'].includes(f) && f !== 'qzt.html');

const SOURCE_FILE = 'posts/8.19pc.html';
const srcHtml = fs.readFileSync(SOURCE_FILE, 'utf8');

const injected = (srcHtml.match(/<!--mrhx-->\n([\s\S]*?)\n<!--mrhx-end-->/) || [])[1] || '';
const barIdx = injected.indexOf('<div class="mrhx-bar">');
const cssBlock = barIdx > 0 ? injected.slice(0, barIdx).trim() : '';
const sharedCssInner = (cssBlock.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const barHtml = barIdx > 0 ? injected.slice(barIdx).trim() : '';
const commentBlock = (srcHtml.match(/<!--mrhx-comments-->[\s\S]*?<!--mrhx-comments-end-->/) || [])[0] || '';
const viewScript = (srcHtml.match(/<script>\s*\(function \(\) \{\s*try \{\s*var day = new Date\(\)[\s\S]*?<\/script>/) || [])[0] || '';
const SRC_PATH = '/' + path.basename(SOURCE_FILE);
const SRC_RE = new RegExp('/(?:posts/)?' + path.basename(SOURCE_FILE).replace(/\./g, '\\.'), 'g');

const parseGames = html => {
  const blocks = [];
  let pos = 0;
  while (pos < html.length) {
    const h3 = html.indexOf('<li class="node heading3">', pos);
    if (h3 < 0) break;
    let depth = 0, i = h3;
    while (i < html.length) {
      if (html.indexOf('<li', i) === i) depth++;
      if (html.indexOf('</li>', i) === i) { depth--; if (depth === 0) { blocks.push(html.slice(h3, i + 5)); pos = i + 5; break; } i += 5; continue; }
      i++;
    }
    if (i >= html.length) { blocks.push(html.slice(h3)); break; }
  }
  return blocks.map(b => {
    const title = ((b.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/) || [])[1] || '').replace(/<em class="mrhx-plat">[^<]*<\/em>/g, '').replace(/<[^>]+>/g, '').replace(/(?:PC\s*\+\s*安卓|PC|安卓){2,}/g, '').trim();
    const intro = (b.match(/<div class="note mm-editor"><span>([\s\S]*?)<\/span><\/div>/) || [])[1] || '';
    const imgs = [...b.matchAll(/src="([^"]+)"/g)].map(m => m[1]);
    const plat = (b.match(/<em class="mrhx-plat">([^<]*)<\/em>/) || [])[1] || '';
    const dls = [...b.matchAll(/<a class="mrhx-btn[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m => ({ url: m[1], label: m[2].replace(/[：:]\s*$/, '') })).filter(d => /^https?:\/\//.test(d.url));
    return { title, intro, imgs, plat, dls };
  }).filter(g => g.title);
};

const shortLabel = l => l.replace(/（不限速）/g, '').replace(/\(不限速\)/g, '');

const slug = t => {
  const s = t.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return s || 'game';
};

const ensureDir = p => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };

const copyImgs = async (game) => {
  const dir = path.join('assets', 'game', game.slug);
  const out = [];
  const seen = new Set();
  for (const url of game.imgs) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const ext = ((url.split('?')[0].match(/\.(jpg|jpeg|png|webp|gif|avif)$/i) || [])[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const file = 'img' + out.length + '.' + ext;
    const local = path.join(dir, file);
    if (!fs.existsSync(local)) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (r.ok) {
          ensureDir(dir);
          fs.writeFileSync(local, Buffer.from(await r.arrayBuffer()));
        }
      } catch (e) {}
    }
    out.push(fs.existsSync(local) ? ASSET_REL + game.slug + '/' + file : url);
  }
  return out;
};

const btnHtml = d => '<a class="mrhx-btn mrhx-btn-' + (d.url.indexOf('pan.baidu.com') > -1 ? 'b' : 'm') + '" href="' + esc(d.url) + '" target="_blank" rel="noreferrer"><span>' + esc(shortLabel(d.label)) + '</span></a>';

const pageCss = `
  .g-back{display:inline-block;margin:18px 2px 14px;font-size:13px;font-weight:600}
  .g-back a{color:#e5484d;text-decoration:none;background:#fff;border:1px solid #f0b4b6;padding:7px 16px;border-radius:99px;transition:.2s;display:inline-flex;align-items:center;gap:6px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .g-back a:hover{background:#e5484d;color:#fff;border-color:#e5484d}
  .g-body{background:#fff;border:1px solid #ecebe9;border-radius:14px;padding:20px 22px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
  .g-note{font-size:14px;color:#444;line-height:1.8;white-space:pre-wrap;word-break:break-word;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .g-note.exp{display:block;white-space:pre-wrap}
  .g-more{display:none;border:none;background:none;color:#e5484d;font-size:13px;font-weight:600;cursor:pointer;padding:8px 2px 0;font-family:inherit}
  .g-imgs{list-style:none;margin-top:14px;padding:0}
  .g-imgs li{margin-bottom:12px}
  .g-imgs img{max-width:100%;height:auto;border-radius:10px;border:1px solid #ecebe9;display:block}
  .g-dl{display:flex;gap:10px;margin-top:16px;flex-wrap:nowrap}
  .g-dl .mrhx-btn{flex:1;justify-content:center;white-space:nowrap}
  @media (max-width:720px){.g-body{padding:14px}.g-dl{gap:8px}.g-dl .mrhx-btn{padding:9px 10px;font-size:13px}}
`;

const pageScript = `
<script>
(function () {
  var note = document.getElementById('g-note');
  if (!note) return;
  var more = document.getElementById('g-more');
  if (note.scrollHeight > note.clientHeight) {
    more.style.display = 'block';
    more.onclick = function () {
      var exp = note.classList.toggle('exp');
      more.textContent = exp ? '收起 ↑' : '展开全部 ↓';
    };
  }
})();
</script>
`;

const gamePage = (g, file) => {
  const bar = barHtml.replace(/href="index\.html"/g, 'href="../index.html"').replace(/href="search\.html"/g, 'href="../search.html"').replace(/action="search\.html"/g, 'action="../search.html"');
  const imgSrc = i => i;
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(g.title)} · ${esc(SITE_NAME)}</title>
<link rel="icon" href="${CDN_URL}/favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="${CDN_URL}/favicon.webp">
<style>
${sharedCssInner}
${pageCss}
</style>
</head>
<body class="narrow">
${bar}
<div class="g-back"><a href="../index.html">← 返回首页</a></div>
<div class="title">${esc(g.title)}${g.plat ? ' <em class="mrhx-plat">' + esc(g.plat) + '</em>' : ''}</div>
<div class="g-body">
  ${g.intro ? '<div class="g-note" id="g-note">' + esc(g.intro) + '</div><button class="g-more" id="g-more">展开全部 ↓</button>' : ''}
  ${g.imgs.length ? '<ul class="g-imgs">' + g.imgs.map(i => '<li><img src="' + esc(imgSrc(i)) + '" alt="" loading="lazy"></li>').join('') + '</ul>' : ''}
  ${g.dls.length ? '<div class="g-dl">' + g.dls.map(btnHtml).join('') + '</div>' : ''}
</div>
${commentBlock ? commentBlock.replace(SRC_RE, '/' + file) : ''}
${viewScript ? viewScript.replace(SRC_RE, '/' + file) : ''}
${pageScript}
</body>
</html>`;
};

const indexCss = `
  .upd{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #f2e2e2;border-left:4px solid #e5484d;border-radius:12px;padding:14px 18px;margin-bottom:10px;font-size:14px;color:#666;box-shadow:0 1px 3px rgba(0,0,0,.04);flex-wrap:wrap}
  .upd b{color:#e5484d}
  .upd .tag{background:#fdf1f1;color:#e5484d;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600}
  .upd-note{font-size:12.5px;color:#999;margin:0 0 16px;padding-left:4px;line-height:1.7}
  .post{display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #ecebe9;border-radius:14px;padding:18px 20px;margin-bottom:20px;text-decoration:none;transition:.25s;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .post:hover{border-color:#f0b4b6;transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.08)}
  .date{flex-shrink:0;width:62px;height:62px;border-radius:12px;background:#e5484d;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;transition:.25s}
  .post:hover .date{transform:rotate(-4deg) scale(1.05)}
  .date b{font-size:22px;font-weight:700}
  .date span{font-size:11px;opacity:.85}
  .info{flex:1;min-width:0}
  .ptitle{font-size:17px;font-weight:700;color:#2b2b2b;margin-bottom:6px}
  .pmeta{font-size:13px;color:#999}
  .pinb{display:inline-block;background:#e58d0a;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;vertical-align:middle}
  .covers{display:flex;gap:8px;flex-shrink:0}
  .covers img{width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #ecebe9;transition:.25s}
  .post:hover .covers img{transform:translateY(-2px)}
  .arrow{flex-shrink:0;color:#d5d2cc;font-size:20px;transition:.2s}
  .post:hover .arrow{color:#e5484d;transform:translateX(5px)}
  .sect{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
  .sect h2{font-size:19px;color:#2b2b2b;position:relative;padding-left:12px;margin:0}
  .sect h2::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:#e5484d}
  .sect span{font-size:13px;color:#aaa}
  .sorts{margin-left:auto;display:flex;gap:6px}
  .sbtn{border:1px solid #e2ded8;background:#fff;color:#888;border-radius:99px;padding:5px 14px;font-size:12px;cursor:pointer;font-family:inherit;transition:.2s}
  .sbtn:hover{color:#e5484d;border-color:#e5484d}
  .sbtn.on{border-color:#e5484d;background:#e5484d;color:#fff}
  .mode-switch{display:inline-block;padding:8px 16px;border-radius:99px;background:#fff;border:1px solid #f0b4b6;color:#e5484d;font-size:13px;font-weight:600;text-decoration:none;transition:.2s;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .mode-switch:hover{background:#e5484d;color:#fff}
  .pcmt{color:#e58d0a}
  .pgbar{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center;margin:22px 0 6px}
  .pg{border:1px solid #e2ded8;background:#fff;color:#666;border-radius:99px;padding:6px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;transition:.2s}
  .pg:hover:not(.off){border-color:#e5484d;color:#e5484d}
  .pg.on{border-color:#e5484d;background:#e5484d;color:#fff}
  .pg.off{opacity:.35;cursor:default}
  .pginfo{font-size:12px;color:#999;margin-left:6px}
  .g-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
  .g-card{background:#fff;border:1px solid #ecebe9;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04);display:flex;flex-direction:column;transition:.2s;animation:mrhxCard .5s ease both;cursor:pointer}
  .g-card:hover{border-color:#f0b4b6;box-shadow:0 8px 22px rgba(229,72,77,.1)}
  .g-card:hover .g-cover img{transform:scale(1.04)}
  @keyframes mrhxCard{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  .g-cover{display:block;aspect-ratio:4/3;background:linear-gradient(135deg,#fbc4c7,#f5d5d8);overflow:hidden;flex-shrink:0}
  .g-cover img{width:100%;height:100%;object-fit:cover;display:block}
  .g-cover .noimg{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#e5484d;font-size:12px;font-weight:600;text-align:center;padding:10px;box-sizing:border-box}
  .g-info{padding:12px 14px 14px;display:flex;flex-direction:column;gap:8px;flex:1}
  .g-t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:600;color:#2b2b2b;line-height:1.5;text-decoration:none;word-break:break-word}
  .g-t:hover{color:#e5484d}
  .g-intro{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;color:#888;line-height:1.6;word-break:break-word}
  .g-hint{font-size:11px;color:#e5484d;margin-top:auto;padding-top:8px;font-weight:600}
  .g-dl{margin-top:auto;display:flex;gap:6px;flex-wrap:nowrap}
  .g-dl .mrhx-btn{flex:1;padding:7px 6px;font-size:12px;border-radius:8px;justify-content:center;white-space:nowrap}
  .g-dl .mrhx-btn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .empty{text-align:center;color:#999;padding:40px 0;font-size:14px}
  @media (max-width:720px){
    .covers{display:none}
    .post{padding:14px;gap:12px}
    .g-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .g-info{padding:10px 11px 12px}
    .g-t{font-size:13px}
    .g-dl .mrhx-btn{font-size:11px;padding:6px 4px}
    .sorts{margin-left:0;width:100%}
  }
`;

const indexScript = `
<script>
(function () {
  var PAGESIZE = 24;
  var grid = document.querySelector('.g-grid');
  var cards = [], pages = 0, nav = null, cur = 0;
  if (grid) {
    cards = [].slice.call(grid.children);
    pages = Math.ceil(cards.length / PAGESIZE);
    if (pages > 1) {
      nav = document.createElement('div');
      nav.className = 'pgbar';
      var h = '<button type="button" class="pg" data-p="-1">‹ 上一页</button>';
      for (var i = 0; i < pages; i++) h += '<button type="button" class="pg" data-p="' + i + '">' + (i + 1) + '</button>';
      h += '<button type="button" class="pg" data-p="' + pages + '">下一页 ›</button>';
      h += '<span class="pginfo">共 ' + pages + ' 页 · 每页 ' + PAGESIZE + ' 个</span>';
      nav.innerHTML = h;
      grid.insertAdjacentElement('afterend', nav);
      nav.addEventListener('click', function (e) {
        var b = e.target.closest('.pg');
        if (!b || b.classList.contains('off')) return;
        var p = parseInt(b.getAttribute('data-p'), 10);
        if (p === -1) p = cur - 1;
        if (p === pages) p = cur + 1;
        if (p < 0 || p >= pages) return;
        cur = p;
        show(p);
      });
    }
  }
  function show(p) {
    cards.forEach(function (c, i) { c.style.display = (i >= p * PAGESIZE && i < (p + 1) * PAGESIZE) ? '' : 'none'; });
    [].slice.call(nav.querySelectorAll('.pg')).forEach(function (b) {
      var bp = parseInt(b.getAttribute('data-p'), 10);
      b.classList.toggle('on', bp === p);
      b.classList.toggle('off', (bp === -1 && p === 0) || (bp === pages && p === pages - 1));
    });
    window.scrollTo({ top: grid.getBoundingClientRect().top + window.pageYOffset - 130, behavior: 'smooth' });
  }
  function reorder(arr) {
    arr.forEach(function (c) { grid.appendChild(c); });
    cards = [].slice.call(grid.children);
    cur = 0;
    if (nav) show(0);
  }
  var sNew = document.getElementById('s-new'), sRand = document.getElementById('s-rand');
  if (sNew && sRand) {
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    sNew.onclick = function () { sNew.classList.add('on'); sRand.classList.remove('on'); reorder(cards.slice()); };
    sRand.onclick = function () { sRand.classList.add('on'); sNew.classList.remove('on'); reorder(shuffle(cards.slice())); };
  }
  document.querySelectorAll('.g-card').forEach(function (c) {
    c.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      var link = c.querySelector('a.g-cover');
      if (link) location.href = link.href;
    });
  });
  var CURL = '${_cUrl}', CANON = '${_cAnon}';
  if (CURL && CANON) {
    fetch(CURL + '/rest/v1/comments?select=url', { headers: { 'apikey': CANON, 'Authorization': 'Bearer ' + CANON } })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        var m = {};
        rows.forEach(function (c) { m[c.url] = (m[c.url] || 0) + 1; });
        document.querySelectorAll('[data-cpath]').forEach(function (el) {
          var n = m[el.getAttribute('data-cpath')];
          if (n) el.textContent = ' · 评论 ' + n + ' 条';
        });
      }).catch(function () {});
  }
})();
</script>
`;

const qztCard = `PLACEHOLDER`;

const searchPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>搜索 · ${esc(SITE_NAME)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh;padding-top:85px}
header{background:#fff;border-bottom:1px solid #ecebe9;position:fixed;top:0;left:0;right:0;z-index:100;box-shadow:0 1px 6px rgba(0,0,0,.04)}
.hwrap{max-width:900px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;gap:16px}
.site{font-size:21px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none}
.site em{font-style:normal;color:#e5484d}
.mrhx-search{display:flex;align-items:center;gap:5px;margin-left:auto}
.mrhx-search input{padding:6px 12px;border:1px solid #e2e0dc;border-radius:99px;font-size:13px;font-family:inherit;background:#faf9f7;color:#333;width:180px;outline:none;transition:.2s}
.mrhx-search input:focus{border-color:#e5484d;background:#fff}
.mrhx-search button{border:none;background:#e5484d;color:#fff;padding:6px 14px;border-radius:99px;font-size:13px;font-weight:600;cursor:pointer;transition:.2s}
.mrhx-search button:hover{background:#c93a3f}
main{max-width:900px;margin:0 auto;padding:28px 20px 60px}
.sect{display:flex;align-items:baseline;gap:10px;margin-bottom:18px}
.sect h2{font-size:19px;color:#2b2b2b;position:relative;padding-left:12px}
.sect h2::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:#e5484d}
.sect span{font-size:13px;color:#aaa}
.result{border:1px solid #ecebe9;border-radius:14px;background:#fff;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.result .rt{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.result .rt a{font-size:16px;color:#2b2b2b;font-weight:700;text-decoration:none}
.result .rt a:hover{color:#e5484d}
.result .rt .src{font-size:11px;color:#fff;background:#e5484d;border-radius:99px;padding:2px 10px}
.result .intro{font-size:13px;color:#666;line-height:1.8;margin-bottom:10px;word-break:break-word}
.result .dl{display:flex;gap:8px;flex-wrap:wrap}
.result .img{margin-top:10px}
.result .img img{max-width:100%;border-radius:10px;border:1px solid #ecebe9}
.btn-dl{display:inline-flex;align-items:center;padding:8px 16px;border-radius:9px;font-size:13px;font-weight:600;text-decoration:none}
.btn-dl-m{background:#e5484d;color:#fff}
.btn-dl-b{background:#e6f4ea;color:#1a7f37;border:1px solid #b7e2c4}
.empty{text-align:center;color:#999;padding:40px 0;font-size:14px}
@media (max-width:720px){body{padding-top:75px}.hwrap{padding:12px 14px}.mrhx-search input{width:110px}main{padding:18px 14px 32px}}
</style>
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html">${SITE_NAME.replace(SITE_LOGO_EM, '<em>' + SITE_LOGO_EM + '</em>')}</a>
    <form class="mrhx-search" action="search.html" method="get">
      <input type="text" name="q" id="q" placeholder="搜索游戏…" autocomplete="off">
      <button type="submit">搜索</button>
    </form>
  </div>
</header>
<main>
  <div class="sect"><h2>搜索结果</h2><span id="count" role="status" aria-live="polite" aria-atomic="true"></span></div>
  <div id="res"></div>
</main>
<footer style="text-align:center;color:#999;font-size:12px;padding:24px 20px;border-top:1px solid #ecebe9">${SITE_FOOTER}</footer>
<script>
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
(function () {
  var q = new URLSearchParams(location.search).get('q') || '';
  var input = document.getElementById('q');
  input.value = q;
  var resBox = document.getElementById('res');
  var countEl = document.getElementById('count');
  var ALL = 30;
  var _hits = [];
  var _page = 0;
  function rowHtml(g) {
    var dl = (g.links || []).map(function (l) {
      var cls = l.url.indexOf('pan.baidu.com') > -1 ? 'btn-dl btn-dl-b' : 'btn-dl btn-dl-m';
      return '<a class="' + cls + '" href="' + esc(l.url) + '" target="_blank" rel="noreferrer">' + esc(l.label) + '</a>';
    }).join('');
    return '<div class="result"><div class="rt"><a href="' + esc(g.p) + '">' + esc(g.title) + '</a><span class="src">' + esc(g.source) + '</span></div>' +
      (g.intro ? '<div class="intro">' + esc(g.intro) + '</div>' : '') +
      (dl ? '<div class="dl">' + dl + '</div>' : '') +
      (g.img ? '<div class="img"><img src="' + esc(g.img) + '" alt="" loading="lazy"></div>' : '') +
      '</div>';
  }
  function renderMore() {
    var slice = _hits.slice(_page * ALL, (_page + 1) * ALL);
    resBox.insertAdjacentHTML('beforeend', slice.map(rowHtml).join(''));
    _page++;
    var moreBtn = document.getElementById('mrhx-more');
    if (moreBtn) moreBtn.style.display = (_page * ALL < _hits.length) ? '' : 'none';
  }
  var moreBtn = document.createElement('div');
  moreBtn.innerHTML = '<button id="mrhx-more" class="btn-dl btn-dl-m" style="border:none;cursor:pointer;padding:10px 28px;border-radius:9px;font-size:14px;font-weight:600">加载更多</button>';
  moreBtn.style.textAlign = 'center';
  moreBtn.style.marginTop = '6px';
  resBox.parentNode.insertBefore(moreBtn, resBox.nextSibling);
  document.getElementById('mrhx-more').onclick = renderMore;
  if (!q) { countEl.textContent = '（输入关键词搜索）'; resBox.innerHTML = '<div class="empty">输入关键词搜索全站游戏</div>'; document.getElementById('mrhx-more').style.display = 'none'; return; }
  fetch('search_index.json').then(function (r) { return r.json(); }).then(function (data) {
    var kw = q.toLowerCase();
    _hits = data.filter(function (g) {
      return (g.title || '').toLowerCase().indexOf(kw) > -1 || (g.intro || '').toLowerCase().indexOf(kw) > -1;
    });
    countEl.textContent = '（找到 ' + _hits.length + ' 个）';
    if (!_hits.length) { resBox.innerHTML = '<div class="empty">没有找到与「' + q + '」相关的游戏</div>'; document.getElementById('mrhx-more').style.display = 'none'; return; }
    renderMore();
  }).catch(function () { resBox.innerHTML = '<div class="empty">搜索索引加载失败</div>'; document.getElementById('mrhx-more').style.display = 'none'; });
})();
</script>
</body>
</html>`;

(async () => {
  const dnum = f => { const m = f.match(/(\d+)\.(\d+)/); return m ? +m[1] * 100 + +m[2] : 0; };
  const ordered = posts.slice().sort((a, b) => dnum(b) - dnum(a));

  const qztHtml = fs.readFileSync('posts/qzt.html', 'utf8');
  const qztGames = parseGames(qztHtml).filter(g => !/免费帮找黄油/.test(g.title)).map(g => Object.assign({}, g, { source: 'qzt' }));
  const games = qztGames.slice();
  for (const f of ordered) {
    const h = fs.readFileSync(POST_DIR + '/' + f, 'utf8');
    games.push(...parseGames(h).map(g => Object.assign({}, g, { source: path.parse(f).name })));
  }
  games.forEach((g, i) => {
    g.slug = (i + 1) + '-' + slug(g.title);
    g.file = g.slug + '.html';
  });

  const qztCount = qztGames.length;
  const qztCovers = [...new Set([...qztHtml.matchAll(/src="(https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@main\/assets\/[^"]+)"/g)].map(m => m[1]))].slice(0, 5)
    .map(src => '<img src="' + src + '" alt="" loading="lazy">').join('');

  const relPath = p => 'game/' + p;
  const pageRel = p => 'game/' + p;
  const idxImg = i => i;
  const slugMap = new Map();
  for (const g of games) {
    if (slugMap.has(g.slug)) errors.push(`重复 slug: ${g.slug} (${slugMap.get(g.slug)} 与 ${g.title})`);
    slugMap.set(g.slug, g.title);
  }
  if (fs.existsSync('game')) fs.rmSync('game', { recursive: true, force: true });
  if (fs.existsSync('assets/game')) fs.rmSync('assets/game', { recursive: true, force: true });
  fs.mkdirSync('game', { recursive: true });
  const searchIndex = [];
  const errors = [];
  for (const g of games) {
    g.imgs = await copyImgs(g);
    for (const i of g.imgs) {
      if (i.indexOf(ASSET_REL) === 0 && !fs.existsSync(i)) errors.push(`图片缺失: ${i} (${g.title})`);
    }
    for (const dl of g.dls) {
      if (dl.url && !/^https?:\/\//.test(dl.url)) errors.push(`非法下载链接: ${g.title} → ${dl.url}`);
    }
    fs.writeFileSync(relPath(g.file), gamePage(g, relPath(g.file)));
    searchIndex.push({ title: g.title, intro: g.intro, img: g.imgs[0] ? idxImg(g.imgs[0]) : '', links: g.dls, plat: g.plat, source: g.source, p: pageRel(g.file) });
  }
  if (errors.length) {
    console.error('❌ 自检未通过:');
    errors.forEach(e => console.error('  - ' + e));
    fs.writeFileSync('gen_report.txt', errors.join('\n'));
    process.exit(1);
  }
  console.log('game pages ok:', games.length);

  const indexBody = games.map((g, gi) => {
    const cover = g.imgs[0] ? '<img src="' + esc(idxImg(g.imgs[0])) + '" alt="" loading="lazy">' : '<div class="noimg">暂无截图</div>';
    const dls = g.dls.length ? '<div class="g-dl">' + g.dls.map(btnHtml).join('') + '</div>' : '';
    return '<div class="g-card" style="animation-delay:' + (gi * 0.03) + 's"><a class="g-cover" href="' + pageRel(g.file) + '">' + cover + '</a><div class="g-info"><a class="g-t" href="' + pageRel(g.file) + '">' + esc(g.title) + (g.plat ? ' <em class="mrhx-plat">' + esc(g.plat) + '</em>' : '') + '</a>' + (g.intro ? '<div class="g-intro">' + esc(g.intro) + '</div>' : '') + dls + '<div class="g-hint">点击卡片进入详情 ›</div></div></div>';
  }).join('\n  ');
  const barIdx2 = barHtml;
  const indexPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(SITE_NAME)} · 每日更新</title>
<link rel="icon" href="${CDN_URL}/favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="${CDN_URL}/favicon.webp">
<style>
${sharedCssInner}
${indexCss}
</style>
</head>
<body class="narrow">
${barIdx2}
<main>
  <div class="upd"><span class="tag">游戏资源</span>本站点共上传了 <b>${games.length}</b> 款游戏资源</div>
  <div class="upd-note">右上角可搜索游戏；没搜到的，可在置顶求助帖评论区留言游戏全名，站长看到会尽快补上</div>
  <div style="margin:0 0 18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
    <a class="mode-switch" href="posts/index.html">合集模式：按帖子浏览</a>
  </div>
  <a class="post" href="posts/qzt.html" data-path="/posts/qzt.html">
  <div class="date"><b>求</b><span>助</span></div>
  <div class="info">
    <div class="ptitle">求助资源帖 <span class="pinb">置顶</span></div>
    <div class="pmeta">共 ${qztCount} 款游戏 · 求资源 / 找游戏在这里留言<span class="pcmt" data-cpath="/posts/qzt.html"></span></div>
  </div>
  ${qztCovers ? '<div class="covers">' + qztCovers + '</div>' : ''}
  <div class="arrow">→</div>
</a>
  <div class="sect"><h2>全部游戏</h2><span id="gcount">${games.length} 款</span><span class="sorts"><button class="sbtn on" id="s-new">最新</button><button class="sbtn" id="s-rand">随机</button></span></div>
  <div class="g-grid">
  ${indexBody}
  </div>
</main>
<footer style="text-align:center;color:#999;font-size:12px;padding:28px 20px 40px;border-top:1px solid #ecebe9;margin-top:34px">${SITE_FOOTER}</footer>
${indexScript}
</body>
</html>`;

  fs.writeFileSync('index.html', indexPage);
  console.log('index.html ok (单游戏模式), games:', games.length);

  fs.writeFileSync('search_index.json', JSON.stringify(searchIndex));
  console.log('search_index.json ok, games:', searchIndex.length);

  fs.writeFileSync('search.html', searchPage);
  console.log('search.html ok');

  const baseUrl = (SITE.site && SITE.site.url || 'https://tkporl.github.io/mrhyfx/').replace(/\/+$/, '');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/index.html</loc><priority>1.0</priority></url>
${games.map(g => `  <url><loc>${baseUrl}/${pageRel(g.file)}</loc><priority>0.6</priority></url>`).join('\n')}
  <url><loc>${baseUrl}/search.html</loc><priority>0.4</priority></url>
</urlset>
`;
  fs.writeFileSync('sitemap.xml', sitemap);
  console.log('sitemap.xml ok');

  const rssItems = games.slice(0, 30).map(g => `    <item>
      <title>${esc(g.title)}</title>
      <link>${baseUrl}/${pageRel(g.file)}</link>
      <guid isPermaLink="true">${baseUrl}/${pageRel(g.file)}</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <description>${esc(g.intro || g.title)}</description>
    </item>`).join('\n');
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${baseUrl}/index.html</link>
    <description>${esc(SITE_NAME)}</description>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>
`;
  fs.writeFileSync('rss.xml', rss);
  console.log('rss.xml ok');
})().catch(e => { console.error(e); process.exit(1); });