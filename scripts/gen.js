const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const files = fs.readdirSync('.').filter(f => /\.html$/i.test(f) && f !== 'index.html' && f !== 'publish.html' && f !== 'Tsinhoht.html' && f !== 'search.html');
if (!files.length) console.warn('未找到每日分享导出文件，将生成空首页');

let overrides = {};
if (fs.existsSync('counts.json')) overrides = readJson('counts.json');

let TITLES = {};
if (fs.existsSync('titles.json')) TITLES = readJson('titles.json');

let NAV = [];
if (fs.existsSync('links.json')) {
  NAV = Object.entries(readJson('links.json'))
    .map(([label, url]) => ({ label, url }));
}

let TIMESTAMPS = {};
if (fs.existsSync('timestamps.json')) TIMESTAMPS = readJson('timestamps.json');

let PINS = [];
if (fs.existsSync('pins.json')) {
  const p = readJson('pins.json');
  if (Array.isArray(p)) PINS = p;
}

let SITE = { comments: { enabled: false, apiBase: '' } };
if (fs.existsSync('site.json')) {
  const s = readJson('site.json');
  SITE = Object.assign({}, SITE, s);
  SITE.comments = Object.assign({}, SITE.comments, s.comments || {});
}

const DOWNLOAD_BUTTONS = (SITE.downloadButtons && Array.isArray(SITE.downloadButtons))
  ? SITE.downloadButtons
  : [
      { name: '百度网盘', pattern: 'pan.baidu.com', cls: 'mrhx-btn-b' },
      { name: '移动云盘（不限速）', pattern: 'yun.139.com', cls: 'mrhx-btn-m' }
    ];

const SITE_NAME = (SITE.site && SITE.site.name) || 'Tsinho黄油推荐站';
const SITE_LOGO_EM = (SITE.site && SITE.site.logoEm) || '分享';
const SITE_TAG = (SITE.site && SITE.site.tag !== undefined) ? SITE.site.tag : '每日更新 · PC + 安卓双平台';
const SITE_FOOTER = (SITE.site && SITE.site.footer !== undefined) ? SITE.site.footer : 'by Tsinho 发布 · 本站仅供学习交流，请于下载后 24 小时内删除，支持正版';
const SITE_AUTHOR = 'Tsinho';

const PUBLISH_RE = /<div class="publish"[\s\S]*?<\/div>/;
const newPublish = `<div class="publish" style="display: flex; align-items: center; justify-content: center;">
        <span>by&nbsp;</span>
        <span style="color:#dc9b04">${SITE_AUTHOR}</span>
        <span>&nbsp;发布&nbsp;·&nbsp;本站仅供学习交流，请支持正版</span>
      </div>`;

const sharedCss = `<style>
  body.narrow{max-width:min(1000px,100%) !important;margin-left:auto !important;margin-right:auto !important;padding-left:24px !important;padding-right:24px !important}
  .mrhx-bar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #ecebe9;padding:16px 20px;display:flex;align-items:center;gap:20px;box-shadow:0 1px 6px rgba(0,0,0,.04)}
  .mrhx-bar .mlogo{font-size:21px;font-weight:800;color:#2b2b2b;text-decoration:none;letter-spacing:1px;white-space:nowrap;flex-shrink:0}
  .mrhx-bar .mlogo span{color:#e5484d}
  .mrhx-bar .mlogo img.mlogo-img{width:140px;height:auto;border-radius:10px;vertical-align:middle;display:inline-block}
  .mrhx-bar .bar-right{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:1;min-width:0}
  .mrhx-bar .search-row{display:flex;align-items:center;gap:6px;width:100%;justify-content:flex-end}
  .mrhx-bar .mnav{display:flex;gap:8px;flex-wrap:wrap;width:100%;justify-content:flex-end}
  .mrhx-bar .mnav a{padding:7px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
  .mrhx-search{display:flex;align-items:center;gap:5px}
  .mrhx-search input{padding:5px 10px;border:1px solid #e2e0dc;border-radius:99px;font-size:12px;font-family:inherit;background:#faf9f7;color:#333;width:140px;outline:none;transition:.2s}
  .mrhx-search input:focus{border-color:#e5484d;background:#fff}
  .mrhx-search button{border:none;background:#e5484d;color:#fff;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;transition:.2s}
  .mrhx-search button:hover{background:#c93a3f}
  .mrhx-bar .mnav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3;transform:translateY(-1px)}
  @media (min-width:721px){
    .mrhx-bar{max-width:min(1000px,100%) !important;margin-left:auto !important;margin-right:auto !important;border-radius:0 0 14px 14px;border-left:1px solid #ecebe9;border-right:1px solid #ecebe9}
  }
  .mrhx-dl{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
  .mrhx-btn{display:inline-flex;align-items:center;padding:9px 18px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;border:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
  .mrhx-btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.12)}
  .mrhx-btn-m{background:#e5484d;color:#fff}
  .mrhx-btn-m:hover{background:#c93a3f}
  .mrhx-btn-b{background:#e6f4ea;color:#1a7f37;border:1px solid #b7e2c4}
  .mrhx-btn-b:hover{background:#d8edde}
  .mrhx-btn-qk{background:#6366f1;color:#fff}
  .mrhx-btn-qk:hover{background:#4f46e5}
  .mrhx-btn-nav{background:#fff;color:#333;border:1px solid #e5e6e8}
  .mrhx-btn-nav:hover{border-color:#e5484d;color:#e5484d;box-shadow:0 4px 12px rgba(0,0,0,.08)}
  .mrhx-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-width:560px}
  .mrhx-grid .mrhx-btn{justify-content:center;text-align:center}
  @keyframes mrhxFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .node{animation:mrhxFade .5s ease both}
  @media (max-width:720px){
    body.narrow{padding-left:12px !important;padding-right:12px !important}
    .mrhx-bar{padding:12px 14px;gap:10px}
    .mrhx-bar .mlogo{font-size:17px}
    .mrhx-bar .mlogo img.mlogo-img{width:100px;height:auto}
    .mrhx-bar .bar-right{gap:8px}
    .mrhx-bar .mnav{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
    .mrhx-bar .mnav a{padding:5px 10px;font-size:12px;white-space:nowrap}
    .mrhx-bar .mnav::-webkit-scrollbar{display:none}
    .mrhx-bar .search-row{width:100%;justify-content:flex-end}
    .mrhx-search{width:100%}
    .mrhx-search input{flex:1;width:auto}
    .mrhx-dl .mrhx-btn{flex:1 1 45%;text-align:center}
    .image-list .image{max-width:100% !important}
  }
  .mrhx-comments{max-width:100%;margin-top:34px;padding-top:22px;border-top:2px solid #ecebe9}
  .mrhx-comments h2{font-size:19px;color:#2b2b2b;margin-bottom:16px;display:flex;align-items:baseline;gap:8px;font-weight:700}
  .mrhx-cnum{font-size:12px;color:#aaa;font-weight:400}
  .mrhx-citem{width:100%;min-width:0;background:#fff;border:1px solid #ecebe9;border-radius:13px;padding:16px 18px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:.2s}
  .mrhx-citem:hover{border-color:#f0b4b6;box-shadow:0 6px 18px rgba(229,72,77,.08)}
  .mrhx-creply-item{width:calc(100% - 22px);min-width:0;margin-left:22px;border-left:3px solid #f0b4b6;border-radius:10px;background:#fdf9f7;box-shadow:none}
  .mrhx-creply-item:hover{box-shadow:0 4px 12px rgba(229,72,77,.05)}
  .mrhx-thread{margin-top:8px;padding-left:0}
  .mrhx-chead{display:flex;align-items:center;gap:11px;margin-bottom:8px;min-width:0}
  .mrhx-cav{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#fbc4c7,#e5484d);color:#fff;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:inset 0 -2px 4px rgba(0,0,0,.08)}
  .mrhx-cmeta{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0}
  .mrhx-cmeta b{font-size:14px;color:#2b2b2b;font-weight:600}
  .mrhx-replyto{font-size:11px;color:#e58d0a;font-weight:500;white-space:nowrap}
  .mrhx-cmeta .mrhx-ctime{font-size:11px;color:#b8b2aa}
  .mrhx-ccontent{font-size:14px;color:#444;line-height:1.85;white-space:pre-wrap;word-break:break-word;padding-left:45px;margin-top:-4px}
  .mrhx-cbar{margin-top:10px;padding-left:45px;display:flex;gap:6px}
  .mrhx-cbtn{border:1px solid #ecebe9;background:#faf9f7;color:#888;font-size:12px;cursor:pointer;padding:5px 12px;border-radius:99px;transition:.2s}
  .mrhx-cbtn:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
  .mrhx-cdel{color:#c93a3f}
  .mrhx-cdel:hover{color:#fff;background:#e5484d;border-color:#e5484d}
  .mrhx-cav-admin{background:linear-gradient(135deg,#ff6b3d,#e5484d)}
  .mrhx-cbadge{display:inline-block;background:#e5484d;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;margin-left:4px;letter-spacing:.5px}
  .mrhx-cpin{background:#e58d0a}
  .mrhx-citem-admin{border-color:#f0b4b6;background:linear-gradient(180deg,#fff,#fff8f7)}
  .mrhx-cpop{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;padding:20px}
  .mrhx-cpop.show{display:flex}
  .mrhx-cpop-box{background:#fff;border-radius:14px;max-width:430px;width:100%;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25);animation:mrhxFade .25s ease both}
  .mrhx-cpop-box h3{font-size:15px;color:#2b2b2b;margin-bottom:10px}
  .mrhx-cpop-box p{font-size:13px;color:#555;line-height:1.9}
  .mrhx-cpop-ok{margin-top:16px;width:100%;border:none;background:#e5484d;color:#fff;padding:10px 0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer}
  .mrhx-cpop-ok:hover{background:#c93a3f}
  .mrhx-cempty{font-size:13px;color:#999;padding:14px 4px;text-align:center}
  .mrhx-cform{margin-top:18px;background:#fff;border:1px solid #ecebe9;border-radius:13px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
  .mrhx-cform-title{font-size:14px;font-weight:700;color:#2b2b2b;margin-bottom:12px;display:flex;align-items:center;gap:6px}
  .mrhx-cform-title::before{content:'';width:4px;height:14px;border-radius:2px;background:#e5484d}
  .mrhx-crow{display:flex;gap:10px;margin-bottom:10px}
  .mrhx-crow input{flex:1;border:1px solid #e2e0dc;border-radius:9px;padding:10px 12px;font-size:13px;font-family:inherit;background:#faf9f7;min-width:0;transition:.2s}
  .mrhx-cform textarea{width:100%;border:1px solid #e2e0dc;border-radius:9px;padding:11px 12px;font-size:13px;font-family:inherit;background:#faf9f7;min-height:82px;resize:vertical;box-sizing:border-box;transition:.2s}
  .mrhx-cform textarea:focus,.mrhx-crow input:focus{outline:none;border-color:#e5484d;background:#fff;box-shadow:0 0 0 3px rgba(229,72,77,.08)}
  .mrhx-csub{justify-content:space-between;align-items:center;margin-bottom:0}
  .mrhx-csub button{border:none;background:#e5484d;color:#fff;padding:10px 26px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:.2s}
  .mrhx-csub button:hover{background:#c93a3f}
  .mrhx-csub button:disabled{opacity:.5;cursor:not-allowed}
  .mrhx-creply{font-size:12px;color:#e5484d;font-weight:500}
  @media (max-width:720px){.mrhx-crow{flex-direction:column;margin-bottom:8px}.mrhx-creply-item{width:calc(100% - 10px);margin-left:10px}.mrhx-ccontent{padding-left:0;overflow-wrap:anywhere;word-break:break-word}.mrhx-cbar{padding-left:0}}
  .mrhx-top{position:fixed;right:20px;bottom:24px;z-index:9999;width:44px;height:44px;border-radius:50%;background:#e5484d;color:#fff;font-size:20px;border:none;cursor:pointer;box-shadow:0 6px 18px rgba(229,72,77,.4);opacity:0;pointer-events:none;transition:.3s;line-height:1}
  .mrhx-top.show{opacity:1;pointer-events:auto}
  .mrhx-top:hover{transform:translateY(-3px);background:#c93a3f}
</style>`;

const topButton = `<button class="mrhx-top" id="mrhxTopBtn" title="滚动到底部">↓</button>
<script>
(function () {
  var b = document.getElementById('mrhxTopBtn');
  if (!b) return;
  function t() {
    var y = window.scrollY || document.documentElement.scrollTop;
    var h = document.documentElement.scrollHeight - window.innerHeight;
    var nearTop = y < 100;
    var nearBottom = h - y < 100;
    if (nearTop) { b.textContent = '\u2193'; b.title = '滚动到底部'; b.onclick = function () { window.scrollTo({ top: h, behavior: 'smooth' }); }; }
    else if (nearBottom) { b.textContent = '\u2191'; b.title = '滚动到顶部'; b.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }; }
    else { b.textContent = '\u2191'; b.title = '滚动到顶部'; b.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }; }
    b.classList.add('show');
  }
  window.addEventListener('scroll', t, { passive: true });
  t();
})();
</script>`;

const popupHtml = (() => {
  const ann = SITE.announcement && SITE.announcement.enabled !== false ? SITE.announcement : null;
  const lines = (ann && ann.lines && ann.lines.length) ? ann.lines
    : ['本站点8月10刚刚起步！可能还存在一些bug！请见谅！', '有任何建议或问题，欢迎在评论区留言或联系站长。'];
  const title = (ann && ann.title) ? ann.title : '📢 公告';
  if (ann && ann.enabled === false) return '';
  return `<div class="mrhx-popup" id="mrhxPopup">
  <div class="mrhx-popup-inner">
    <button class="mrhx-popup-close" onclick="document.getElementById('mrhxPopup').style.display='none'">×</button>
    <div class="mrhx-popup-content">
      <h3>${title}</h3>
      ${lines.map(l => `<p>${l}</p>`).join('\n      ')}
    </div>
    <button class="mrhx-popup-btn" onclick="document.getElementById('mrhxPopup').style.display='none'">我知道了</button>
  </div>
</div>
<style>
.mrhx-popup{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:mrhxPopFade .3s ease both}
.mrhx-popup-inner{background:#fff;border-radius:16px;padding:30px 28px 22px;max-width:400px;width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;text-align:center;animation:mrhxPopSlide .3s ease both}
.mrhx-popup-close{position:absolute;top:10px;right:12px;width:30px;height:30px;border:none;border-radius:50%;background:#faf9f7;color:#666;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mrhx-popup-close:hover{background:#fdf1f1;color:#e5484d}
.mrhx-popup-content h3{font-size:18px;color:#2b2b2b;margin-bottom:12px}
.mrhx-popup-content p{font-size:14px;color:#666;line-height:1.8;margin-bottom:8px;white-space:pre-wrap}
.mrhx-popup-btn{margin-top:14px;padding:10px 28px;border:none;border-radius:10px;background:#e5484d;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:.2s}
.mrhx-popup-btn:hover{background:#c93a3f;transform:translateY(-2px)}
@keyframes mrhxPopFade{from{opacity:0}to{opacity:1}}
@keyframes mrhxPopSlide{from{opacity:0;transform:translateY(20px) scale(.95)}to{opacity:1;transform:none}}
</style>`;
})();

const viewScript = (sb, key, path) => `<script>
(function () {
  try {
    var day = new Date().toISOString().slice(0, 10);
    var k = 'mrhx_v_' + day + '_' + '${path}'.replace(/[^a-zA-Z0-9]/g, '_');
    if (localStorage.getItem(k)) return;
    localStorage.setItem(k, '1');
    var h = { 'apikey': '${key}', 'Authorization': 'Bearer ${key}', 'Content-Type': 'application/json' };
    fetch('${sb}/rest/v1/rpc/inc_page_view', { method: 'POST', headers: h, body: JSON.stringify({ p_url: '${path}' }) });
    fetch('${sb}/rest/v1/rpc/inc_daily_view', { method: 'POST', headers: h, body: JSON.stringify({ p_url: '${path}', p_day: day }) }).catch(function () {});
  } catch (e) {}
})();
</script>`;

const staggered = Array.from({ length: 20 }, (_, i) => `.node:nth-child(${i + 1}){animation-delay:${i * 0.05}s}`).join('\n');

function dayTag(file) {
  const m = file.match(/(\d+)月(\d+)/);
  return m ? `${m[1]}月${m[2]}` : path.parse(file).name;
}

function iconTitle(d) {
  const cut = d.split(/[（(]/)[0].trim();
  return cut || d;
}

async function localize(html, tag) {
  const urls = [...new Set([...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map(m => m[1]))];
  if (urls.length) {
    const dir = path.join('assets', tag);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const url of urls) {
      const name = `img_${String(++n).padStart(2, '0')}.png`;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
          html = html.split(url).join(`assets/${tag}/${name}`);
          console.log('  img', tag, name);
          break;
        } catch (e) {
          if (attempt === 3) console.warn('  下载失败(保留原链接):', url, e.message);
          else await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }
  html = html.replace(/assets\/[^"/]+(?=\/)/g, 'assets/' + tag);
  return html.split('crossorigin="anonymous"').join('');
}

function extractLinks(noteHtml) {
  const links = [];
  const re = /<a class="content-link"[^>]*href="([^"]+)"[^>]*><span class="content-link-text">([^<]*)<\/span><\/a>/g;
  let m;
  while ((m = re.exec(noteHtml)) !== null) links.push({ url: m[1], label: m[2].replace(/[：:]\s*$/, '') });
  return links;
}

function rebuildNote(noteHtml) {
  const links = extractLinks(noteHtml);
  let plain = noteHtml.replace(/<a[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '');
  plain = plain.replace(/下载链接/g, '').replace(/移动（不限速）：/g, '').replace(/度盘：/g, '');
  plain = plain.replace(/[\s\u200b\u200c]+/g, ' ').trim();
  const btns = links.map(l => {
    let matched = DOWNLOAD_BUTTONS.find(b => b.pattern && l.url.includes(b.pattern));
    const name = matched ? matched.name : l.label;
    const cls = matched ? matched.cls : 'mrhx-btn mrhx-btn-qk';
    return `<a class="${cls}" href="${esc(l.url)}" target="_blank" rel="noreferrer">${name}</a>`;
  }).join('');
  return `<span>${esc(plain)}</span><div class="mrhx-dl">${btns}</div>`;
}

function extractExtras(html) {
  return [];
}

function emptyIndex(navLinks) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SITE_NAME} · 每日更新</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
header{background:#fff;border-bottom:1px solid #ecebe9}
  .hwrap{max-width:900px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:20px}
  .site{font-size:19px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none;flex-shrink:0}
  .site img.site-logo{width:120px;height:auto;border-radius:8px;vertical-align:middle;display:inline-block}
  .site em{font-style:normal;color:#e5484d}
  .site small{font-size:11px;font-weight:400;color:#999;display:block;letter-spacing:0}
  .site-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:1;min-width:0}
  nav{width:100%;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  nav a{padding:6px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7}
  .mrhx-search{display:flex;align-items:center;gap:5px;width:100%;justify-content:flex-end}
  .mrhx-search input{padding:5px 10px;border:1px solid #e2e0dc;border-radius:99px;font-size:12px;font-family:inherit;background:#faf9f7;color:#333;width:130px;outline:none;transition:.2s}
  .mrhx-search input:focus{border-color:#e5484d;background:#fff}
  .mrhx-search button{border:none;background:#e5484d;color:#fff;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;transition:.2s}
  .mrhx-search button:hover{background:#c93a3f}
  nav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
  @media (max-width:720px){.hwrap{padding:12px 14px}nav{gap:6px}nav a{padding:5px 10px;font-size:12px}.site img.site-logo{width:90px;height:auto}.mrhx-search input{width:90px}}
</style>
<link rel="icon" href="favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="favicon.webp">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="logo.webp" alt="Tsinho黄油推荐站" class="site-logo"></a>
    <div class="site-header-right">
      <form class="mrhx-search" action="search.html" method="get">
      <input type="text" name="q" placeholder="搜索游戏…" autocomplete="off">
      <button type="submit">搜索</button>
    </form>
      <nav>${navLinks}</nav>
    </div>
  </div>
</header>
<main>
  <p>暂无分享，敬请期待</p>
</main>
<footer>${SITE_FOOTER}</footer>
${popupHtml}
${topButton}
${SITE.comments.enabled && SITE.comments.url && SITE.comments.anonKey ? viewScript(SITE.comments.url.replace(/\/+$/, ''), SITE.comments.anonKey, '/index.html') : ''}
</body>
</html>
`;
}

function verify(days, index) {
  const errors = [];
  for (const d of days) {
    const ref = `href="${esc(d.file)}"`;
    if (!index.includes(ref)) errors.push(`首页缺少帖子链接: ${d.file}`);
    const h = fs.readFileSync(d.file, 'utf8');
    if (!h.includes('<li class="node"') && !h.includes('暂无')) errors.push(`帖子正文缺失节点: ${d.file}`);
    if (Number(d.gameCount) > 0 && !index.includes(`共 ${d.gameCount} 款游戏`)) errors.push(`首页游戏数与实际不符: ${d.file} (${d.gameCount})`);
    const disp = TITLES[path.parse(d.file).name] || path.parse(d.file).name;
    const titleOk = h.includes(`<title>${esc(disp)} · ${esc(SITE_NAME)}</title>`);
    const h1Ok = h.includes(`>${esc(disp)}</div>`);
    if (!titleOk && !h1Ok) errors.push(`帖子标题未同步: ${d.file} (期望 ${disp})`);
    if (SITE.comments.enabled && !h.includes('<!--mrhx-comments-->')) errors.push(`评论区注入缺失: ${d.file}`);
    if (SITE.comments.enabled && !h.includes('inc_page_view')) errors.push(`浏览量脚本注入缺失: ${d.file}`);
  }
  if (errors.length) {
    console.error('❌ 发布自检未通过:');
    errors.forEach(e => console.error('  - ' + e));
    try {
      fs.writeFileSync('gen_report.txt', errors.join('\n'));
    } catch (e) {}
    process.exit(1);
  }
  console.log('✅ 发布自检通过:', days.length, '个帖子');
}

const days = [];
const searchIndex = [];
(async () => {
  for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    const computed = (html.match(/<li class="node[^"]*heading/g) || []).length;
    const tag = dayTag(file);
    const gameCount = overrides[tag] !== undefined ? overrides[tag] : computed;

    html = await localize(html, tag);

    const iconRe = /(?:<link rel="icon"[^>]*>\s*<link rel="apple-touch-icon"[^>]*>\s*)+/g;
    html = html.replace(iconRe, (m) => {
      const first = m.match(/<link rel="icon"[^>]*>/);
      const second = m.match(/<link rel="apple-touch-icon"[^>]*>/);
      return first && second ? `${first[0]}\n${second[0]}\n` : m;
    });
    const viewRe = /(<script>\s*\(function \(\) \{\s*try \{[\s\S]*?inc_page_view[\s\S]*?<\/script>\s*)(?=[\s\S]*?inc_page_view)/g;
    html = html.replace(viewRe, '');

    html = html.replace(/\n\s*<li class="node">[\s\S]*?<\/li>/g, '');

    const alreadyProcessed = /<div class="mrhx-dl"><a class="mrhx-btn/.test(html);

    if (!alreadyProcessed) {
    html = html.replace(/<div class="note mm-editor">([\s\S]*?)<\/div>/g,
      (m, inner) => (inner.includes('mrhx-dl') || extractLinks(inner).length === 0) ? m
        : '<div class="note mm-editor">' + rebuildNote(inner) + '</div>');

html = (function reorderNodes(str) {
    var start = str.indexOf('<ul class="node-list">');
    if (start < 0) return str;
    var end = str.lastIndexOf('</ul>');
    if (end < start) return str;
    var prefix = str.slice(0, start);
    var inner = str.slice(start + 21, end);
    var suffix = str.slice(end + 5);
    var blocks = [], pos = 0;
    while (pos < inner.length) {
      var h3 = inner.indexOf('<li class="node heading3">', pos);
      if (h3 < 0) { blocks.push(inner.slice(pos)); break; }
      if (h3 > pos) blocks.push(inner.slice(pos, h3));
      var depth = 1, i = h3 + 27;
      while (i < inner.length) {
        if (inner.indexOf('<ul class="image-list">', i) === i) {
          var uEnd = inner.indexOf('</ul>', i + 22);
          if (uEnd >= 0) { i = uEnd + 5; continue; }
        }
        if (inner.indexOf('<li', i) === i) depth++;
        if (inner.indexOf('</li>', i) === i) { depth--; if (depth === 0) { blocks.push(inner.slice(h3, i + 5)); pos = i + 5; break; } i += 5; continue; }
        i++;
      }
      if (i >= inner.length) { blocks.push(inner.slice(h3)); break; }
    }
    blocks = blocks.map(function(block) {
      if (block.indexOf('node heading3') < 0) return block;
      var dlm = block.match(/<div class="mrhx-dl">[\s\S]*?<\/div>/);
      var dlBlock = dlm ? dlm[0] : '';
      var clean = dlBlock ? block.replace(dlBlock, '') : block;
      var content = clean.match(/<div class="content mm-editor" ><span>[\s\S]*?<\/span><\/div>/);
      var note = clean.match(/<div class="note mm-editor">[\s\S]*?<\/div>/);
      var img = clean.match(/<ul class="image-list">[\s\S]*?<\/ul>/);
      if (!note && !img) return block;
      var noteBlock = note ? note[0] : '';
      var imgBlock = img ? img[0] : '';
      var openTag = clean.match(/<li class="node heading3">[\s\S]*?<\/div>[\s\S]*?<\/div>\s*/);
      var open = openTag ? openTag[0] : '<li class="node heading3">';
      return open + (content ? content[0] : '') + (noteBlock ? '\n    ' + noteBlock : '') + (imgBlock ? '\n    ' + imgBlock : '') + (dlBlock ? '\n    ' + dlBlock : '') + '\n  </li>';
    });
    return prefix + '<ul class="node-list">\n' + blocks.join('') + '\n  </ul>' + suffix;
  })(html);
    }

    html = html.replace(PUBLISH_RE, newPublish);

    const extrasNodes = `<li class="node">
    <div class="content mm-editor" ><div class="mrhx-grid">
    ${NAV.map(n => `<a class="mrhx-btn mrhx-btn-nav" href="${esc(n.url)}" target="_blank" rel="noreferrer">${n.label}</a>`).join('\n    ')}
  </div></div>
  </li>`;
    const lastLi = html.lastIndexOf('</li>');
    html = html.slice(0, lastLi + 5) + '\n' + extrasNodes + html.slice(lastLi + 5);

    const navPills = [`<a href="index.html">首页</a>`, ...NAV.map(n =>
      `<a href="${esc(n.url)}" target="_blank" rel="noreferrer">${n.label}</a>`)].join('\n    ');
    const bar = `<div class="mrhx-bar">
  <a class="mlogo" href="index.html"><img src="logo.webp" alt="Tsinho黄油推荐站" class="mlogo-img"></a>
  <div class="bar-right">
  <div class="search-row">
  <form class="mrhx-search" action="search.html" method="get">
    <input type="text" name="q" placeholder="搜索游戏…" autocomplete="off">
    <button type="submit">搜索</button>
  </form>
  </div>
  <div class="mnav">${navPills}</div>
  </div>
</div>`;
    const injected = `<!--mrhx-->\n${sharedCss}\n${bar}\n<!--mrhx-end-->`;
    html = html.replace(/<body([^>]*)>/, (m, a) => a.includes('class') ? m : `<body class="narrow">`);
    html = html.replace(/\s*<!--mrhx-->[\s\S]*?<!--mrhx-end-->\s*/g, `\n  ${injected}\n  `);
    if (!html.includes('<!--mrhx-->')) {
      html = html.replace(/(<body[^>]*>)[\s\S]*?(<div class="title">)/, `$1\n  ${injected}\n  $2`);
    }
    html = html.replace(/\s*<!--mrhx-stagger--><style>[\s\S]*?<\/style>\s*/g, '\n');
    if (!html.includes('<!--mrhx-stagger-->')) {
      html = html.replace('</body>', `  <!--mrhx-stagger--><style>\n${staggered}\n</style>\n  </body>`);
    }
    const shortName = path.parse(file).name;
    const dispTitle = TITLES[shortName] || shortName;
    html = html.replace(/<div class="title">[\s\S]*?<\/div>/, `<div class="title">${esc(dispTitle)}</div>`);
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(dispTitle)} · ${esc(SITE_NAME)}</title>`);
    html = html.replace('</head>', (html.includes('rel="icon" href="favicon.webp"')) ? '</head>' : `<link rel="icon" href="favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="favicon.webp">
</head>`);

    const v = SITE.comments;
    let commentBlock = '';
    if (v.enabled && v.url && v.anonKey) {
      const sb = esc(v.url.replace(/\/+$/, ''));
      const key = esc(v.anonKey);
      commentBlock = `<!--mrhx-comments-->
<div class="mrhx-comments" id="mrhx-comments">
  <h2>评论区<span class="mrhx-cnum" id="mrhx-cnum"></span></h2>
  <div id="mrhx-clist"></div>
  <form id="mrhx-cform" class="mrhx-cform">
    <div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true">
      <label>请不要填写此栏<input type="text" id="mrhx-hp" name="website" tabindex="-1" autocomplete="off"></label>
    </div>
    <div class="mrhx-cform-title">💬 发表评论</div>
    <div class="mrhx-crow">
      <input type="text" id="mrhx-nick" placeholder="昵称" maxlength="30" required>
      <input type="email" id="mrhx-mail" placeholder="常用邮箱（站长回复会发到这里）" required>
    </div>
    <textarea id="mrhx-ctext" placeholder="友善评论，请支持正版…" required></textarea>
    <div class="mrhx-crow mrhx-csub">
      <span id="mrhx-creply" class="mrhx-creply"></span>
      <button type="submit">发表评论</button>
    </div>
  </form>
</div>
<div class="mrhx-cpop" id="mrhx-cpop">
  <div class="mrhx-cpop-box">
    <h3>邮箱填写提示</h3>
    <p>请填写您日常使用的电子邮箱地址。当网站管理员对您做出回复后，系统将自动把管理员的回复内容发送至您所填写的邮箱地址，以便您及时查收和查看回复信息。</p>
    <button type="button" class="mrhx-cpop-ok" id="mrhx-cpop-ok">知道了</button>
  </div>
</div>
<script>
(function () {
  var SB = '${sb}';
  var KEY = '${key}';
  var PATH = '/${esc(shortName)}.html';
  var ADMIN = localStorage.getItem('mrhx_comments_admin') || '';
  var list = document.getElementById('mrhx-clist');
  var form = document.getElementById('mrhx-cform');
  var nickEl = document.getElementById('mrhx-nick'), mailEl = document.getElementById('mrhx-mail'), textEl = document.getElementById('mrhx-ctext');
  var hpEl = document.getElementById('mrhx-hp');
  var pop = document.getElementById('mrhx-cpop'), popOk = document.getElementById('mrhx-cpop-ok');
  var replyEl = document.getElementById('mrhx-creply');
  var replyPid = null;
  var all = [];
  var popShown = false;
  if (pop) {
    mailEl.addEventListener('focus', function () { if (!popShown) { popShown = true; pop.classList.add('show'); } });
    pop.addEventListener('click', function (e) { if (e.target === pop) pop.classList.remove('show'); });
    popOk.addEventListener('click', function () { pop.classList.remove('show'); });
  }
  function h(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; }
  function headers() {
    return { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  }
  function render() {
    list.textContent = '';
    document.getElementById('mrhx-cnum').textContent = all.length ? '（' + all.length + ' 条）' : '';
    function addRow(c) {
      var row = h('div', 'mrhx-citem' + (c.is_admin ? ' mrhx-citem-admin' : ''));
      var head = h('div', 'mrhx-chead');
      head.appendChild(h('span', 'mrhx-cav' + (c.is_admin ? ' mrhx-cav-admin' : ''), String(c.nick || '匿')[0].toUpperCase()));
      var meta = h('div', 'mrhx-cmeta');
      meta.appendChild(h('b', '', c.nick || '匿名'));
      if (c.pid) {
        var parent = all.filter(function(p) { return p.id === c.pid; })[0];
        if (parent) meta.appendChild(h('span', 'mrhx-replyto', '回复 @' + (parent.nick || '匿名')));
      }
      if (c.is_admin) meta.appendChild(h('span', 'mrhx-cbadge', '站长'));
      if (c.pinned) meta.appendChild(h('span', 'mrhx-cbadge mrhx-cpin', '置顶'));
      meta.appendChild(h('span', 'mrhx-ctime', new Date(c.created_at).toLocaleString()));
      head.appendChild(meta);
      row.appendChild(head);
      row.appendChild(h('div', 'mrhx-ccontent', c.content));
      var bar = h('div', 'mrhx-cbar');
      var rp = h('button', 'mrhx-cbtn', '回复');
      rp.onclick = function () {
        if (replyPid === c.id) { replyPid = null; replyEl.textContent = ''; }
        else { replyPid = c.id; replyEl.textContent = '回复 @' + (c.nick || '匿名') + '（再次点击取消）'; }
      };
      bar.appendChild(rp);
      if (ADMIN) {
        var dl = h('button', 'mrhx-cbtn mrhx-cdel', '删除');
        dl.onclick = function () {
          if (!confirm('删除这条评论及其回复？')) return;
          fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'DELETE', headers: Object.assign(headers(), { 'x-admin-key': ADMIN }) })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
            .catch(function (e) { alert('删除失败：' + e.message); });
        };
        bar.appendChild(dl);
        if (!c.pid) {
          var pin = h('button', 'mrhx-cbtn', c.pinned ? '取消置顶' : '置顶');
          pin.onclick = function () {
            fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign(headers(), { 'x-admin-key': ADMIN, 'Prefer': 'return=minimal' }), body: JSON.stringify({ pinned: !c.pinned }) })
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
              .catch(function (e) { alert('置顶失败：' + e.message + '\\n请先在 Supabase 运行 README 中的升级 SQL（comments 表添加 pinned 字段）。'); });
          };
          bar.appendChild(pin);
        }
      }
      row.appendChild(bar);
      list.appendChild(row);
    }
    function addTree(pid) {
      all.filter(function (c) { return (c.pid || null) === pid; })
        .sort(function (a, b) {
          if (pid === null) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.created_at.localeCompare(b.created_at);
          return a.created_at.localeCompare(b.created_at);
        })
        .forEach(function (c) {
          addRow(c);
          c._el = list.lastChild;
          var children = all.filter(function (x) { return x.pid === c.id; })
            .sort(function (a, b) { return a.created_at.localeCompare(b.created_at); });
          if (!children.length) return;
          var threadBox = h('div', 'mrhx-thread');
          c._el.appendChild(threadBox);
          children.forEach(function (child) {
            var childRow = h('div', 'mrhx-citem mrhx-creply-item');
            var childHead = h('div', 'mrhx-chead');
            childHead.appendChild(h('span', 'mrhx-cav', String(child.nick || '匿')[0].toUpperCase()));
            var childMeta = h('div', 'mrhx-cmeta');
            childMeta.appendChild(h('b', '', child.nick || '匿名'));
            if (child.is_admin) childMeta.appendChild(h('span', 'mrhx-cbadge', '站长'));
            childMeta.appendChild(h('span', 'mrhx-ctime', new Date(child.created_at).toLocaleString()));
            childHead.appendChild(childMeta);
            childRow.appendChild(childHead);
            childRow.appendChild(h('div', 'mrhx-ccontent', child.content));
            var childBar = h('div', 'mrhx-cbar');
            var childRp = h('button', 'mrhx-cbtn', '回复');
            childRp.onclick = function () {
              if (replyPid === child.id) { replyPid = null; replyEl.textContent = ''; }
              else { replyPid = child.id; replyEl.textContent = '回复 @' + (child.nick || '匿名') + '（再次点击取消）'; }
            };
            childBar.appendChild(childRp);
            if (ADMIN) {
              var childDl = h('button', 'mrhx-cbtn mrhx-cdel', '删除');
              childDl.onclick = function () {
                if (!confirm('删除这条评论及其回复？')) return;
                fetch(SB + '/rest/v1/comments?id=eq.' + child.id, { method: 'DELETE', headers: Object.assign(headers(), { 'x-admin-key': ADMIN }) })
                  .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
                  .catch(function (e) { alert('删除失败：' + e.message); });
              };
              childBar.appendChild(childDl);
            }
            childRow.appendChild(childBar);
            threadBox.appendChild(childRow);
            addTree(child.id);
          });
        });
    }
    addTree(null);
    if (!all.length) list.appendChild(h('p', 'mrhx-cempty', '还没有评论，来说两句吧'));
  }
  function load() {
    fetch(SB + '/rest/v1/comments?url=eq.' + encodeURIComponent(PATH) + '&select=id,pid,nick,is_admin,pinned,content,created_at&order=created_at.asc', { headers: headers() })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + (t ? '：' + t.slice(0, 200) : '')); }); return r.json(); })
      .then(function (d) { all = d || []; render(); })
      .catch(function (e) { list.textContent = '评论加载失败（' + e.message + '），请稍后再试'; });
  }
  form.onsubmit = function (e) {
    e.preventDefault();
    if (hpEl && hpEl.value) { form.reset(); return; }
    var nick = nickEl.value.trim(), mail = mailEl.value.trim(), content = textEl.value.trim();
    if (!nick || !mail || !content) { alert('请填写昵称、邮箱和内容'); return; }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(mail)) { alert('邮箱格式不正确'); return; }
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '发送中…';
    fetch(SB + '/rest/v1/rpc/guard_comment', {
      method: 'POST',
      headers: Object.assign(headers(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body: JSON.stringify({ p_url: PATH, p_nick: nick, p_email: mail, p_content: content, p_pid: replyPid || null })
    }).then(function (r) {
      if (r.status === 404) throw new Error('评论防护服务尚未部署，请联系站长');
      if (!r.ok) return r.json().then(function (d) { throw new Error((d && (d.message || d.details)) || 'HTTP ' + r.status); });
      return r.json();
    }).then(function (d) {
      if (d && d.ok === false) throw new Error(d.error || '评论未通过检查');
      replyPid = null; replyEl.textContent = '';
      form.reset();
      load();
    }).catch(function (e) { alert('发送失败：' + e.message); }).finally(function () { btn.disabled = false; btn.textContent = '发表评论'; });
  };
  load();
})();
</script>
<!--mrhx-comments-end-->`;
    }
    html = html.replace(/<!--mrhx-comments-->[\s\S]*?<!--mrhx-comments-end-->\s*/g, '');
    html = html.replace(/<button class="mrhx-top" id="mrhxTopBtn"[\s\S]*?<\/script>\s*/g, '');
    const topBtn = topButton;
    const vb = (v.enabled && v.url && v.anonKey) ? viewScript(v.url.replace(/\/+$/, ''), v.anonKey, '/' + shortName + '.html') : '';
    const staggerBlock = html.includes('<!--mrhx-stagger-->') ? '' : `\n  <!--mrhx-stagger--><style>\n${staggered}\n</style>`;
    html = html.replace('</body>', (html.includes('inc_page_view') || !vb) ? `  ${topBtn}${commentBlock ? '\n  ' + commentBlock : ''}${staggerBlock}\n  </body>` : `  ${topBtn}\n  ${commentBlock}${commentBlock ? '\n  ' : ''}${vb}${staggerBlock}\n  </body>`);

    const searchBlocks = [];
    let pos = 0;
    while (pos < html.length) {
      const h3 = html.indexOf('<li class="node heading3">', pos);
      if (h3 < 0) break;
      let depth = 0, i = h3;
      while (i < html.length) {
        if (html.indexOf('<li', i) === i) depth++;
        if (html.indexOf('</li>', i) === i) { depth--; if (depth === 0) { searchBlocks.push(html.slice(h3, i + 5)); pos = i + 5; break; } i += 5; continue; }
        i++;
      }
      if (i >= html.length) { searchBlocks.push(html.slice(h3)); break; }
    }
    const games = searchBlocks.map(b => {
      const title = (b.match(/<div class="content mm-editor" ><span>([^<]*)<\/span><\/div>/) || [])[1] || '';
      const intro = (b.match(/<div class="note mm-editor"><span>([^<]*)<\/span><\/div>/) || [])[1] || '';
      const img = (b.match(/src="([^"]+)"/) || [])[1] || '';
      const links = [...b.matchAll(/<a class="mrhx-btn[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m => ({ url: m[1], label: m[2].replace(/[：:]\s*$/, '') }));
      return { title, intro, img, links, source: TITLES[shortName] || shortName };
    }).filter(g => g.title);
    searchIndex.push(...games);

    fs.writeFileSync(file, html);
    console.log('day page ok:', file, '(' + gameCount + ' 款游戏)');
    days.push({ file, gameCount, tag });
  }

  days.sort((a, b) => {
    const ka = path.parse(a.file).name, kb = path.parse(b.file).name;
    const pa = PINS.indexOf(ka), pb = PINS.indexOf(kb);
    if (pa !== -1 && pb !== -1) return pa - pb;
    if (pa !== -1) return -1;
    if (pb !== -1) return 1;
    const ta = TIMESTAMPS[ka], tb = TIMESTAMPS[kb];
    if (ta && tb) return (new Date(tb) - new Date(ta));
    if (ta) return -1;
    if (tb) return 1;
    const ma = a.file.match(/(\d+)月(\d+)/), mb = b.file.match(/(\d+)月(\d+)/);
    if (ma && mb) return (mb[1] - ma[1]) * 100 + (mb[2] - ma[2]);
    return b.file.localeCompare(a.file);
  });

  const navLinks = NAV.map(n =>
    `<a href="${esc(n.url)}" target="_blank" rel="noreferrer">${n.label}</a>`).join('');

  if (!days.length) {
    fs.writeFileSync('index.html', emptyIndex(navLinks));
    console.log('index.html ok, days: 0');
    return;
  }

  const newest = fs.readFileSync(days[0].file, 'utf8');
  const headEnd = newest.indexOf('>', newest.indexOf('<body')) + 1;
  const dayDateM = days[0].file.match(/(\d+)月(\d+)/);
  const dayDate = dayDateM ? `${dayDateM[1]}月${dayDateM[2]}` : path.parse(days[0].file).name;

  const dayLis = days.map((d, di) => {
    const title = path.parse(d.file).name;
    const disp = TITLES[title] || title;
    const pinned = PINS.indexOf(title) !== -1;
    const plat = /安卓/.test(title) ? 'PC + 安卓' : /PC/i.test(title) ? 'PC' : '';
    const dateM = title.match(/(\d+)月(\d+)/);
    const dateN = title.match(/(\d+)\.(\d+)/);
    const badge = dateM ? `<b>${dateM[2]}</b><span>${dateM[1]}月</span>`
      : dateN ? `<b>${dateN[2]}</b><span>${dateN[1]}月</span>`
      : `<b style="font-size:12px">${esc(iconTitle(disp))}</b>`;
    const dayHtml = fs.readFileSync(d.file, 'utf8');
    const covers = [...new Set([...dayHtml.matchAll(/src="(assets\/[^"]+)"/g)].map(m => m[1]))].slice(0, 5)
      .map(src => `<img src="${src}" alt="" loading="lazy">`).join('');
    return `<a class="post" href="${d.file}" style="animation-delay:${di * 0.1}s">
  <div class="date">${badge}</div>
  <div class="info">
    <div class="ptitle">${esc(disp)}${pinned ? ` <span class="pinb">置顶</span>` : ''}</div>
    <div class="pmeta">共 ${d.gameCount} 款游戏${plat ? ' · ' + plat : ''}</div>
  </div>
  ${covers ? `<div class="covers">${covers}</div>` : ''}
  <div class="arrow">→</div>
</a>`;
  }).join('\n');

  const totalGames = days.reduce((s, d) => s + (Number(d.gameCount) || 0), 0);

  const index = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SITE_NAME} · 每日更新</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
header{background:#fff;border-bottom:1px solid #ecebe9;position:sticky;top:0;z-index:10}
.hwrap{max-width:900px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;gap:20px}
.site{font-size:21px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none;flex-shrink:0}
.site img.site-logo{width:140px;height:auto;border-radius:10px;vertical-align:middle;display:inline-block}
.site em{font-style:normal;color:#e5484d}
.site small{font-size:11px;font-weight:400;color:#999;display:block;letter-spacing:0}
.site small{display:block;font-size:11px;font-weight:400;color:#999;letter-spacing:0}
.site-header-right{display:flex;flex-direction:column;align-items:flex-end;gap:10px;flex:1;min-width:0}
nav{width:100%;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
nav a{padding:7px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
.mrhx-search{display:flex;align-items:center;gap:5px;width:100%;justify-content:flex-end}
.mrhx-search input{padding:5px 10px;border:1px solid #e2e0dc;border-radius:99px;font-size:12px;font-family:inherit;background:#faf9f7;color:#333;width:140px;outline:none;transition:.2s}
.mrhx-search input:focus{border-color:#e5484d;background:#fff}
.mrhx-search button{border:none;background:#e5484d;color:#fff;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:600;cursor:pointer;transition:.2s}
.mrhx-search button:hover{background:#c93a3f}
nav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3;transform:translateY(-1px)}
@keyframes mrhxDrop{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes mrhxCard{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
main{max-width:900px;margin:0 auto;padding:28px 20px 44px}
.upd{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #f2e2e2;border-left:4px solid #e5484d;border-radius:12px;padding:14px 18px;margin-bottom:26px;font-size:14px;color:#666;box-shadow:0 1px 3px rgba(0,0,0,.04);animation:mrhxCard .5s ease both;flex-wrap:wrap}
.upd b{color:#e5484d}
.upd .tag{background:#fdf1f1;color:#e5484d;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600}
.sect{display:flex;align-items:baseline;gap:10px;margin-bottom:18px}
.sect h2{font-size:19px;color:#2b2b2b;position:relative;padding-left:12px}
.sect h2::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:#e5484d}
.sect span{font-size:13px;color:#aaa}
.post{display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #ecebe9;border-radius:14px;padding:18px 20px;margin-bottom:14px;text-decoration:none;transition:.25s;box-shadow:0 1px 2px rgba(0,0,0,.03);animation:mrhxCard .55s ease both}
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
.empty{text-align:center;color:#999;padding:40px 0}
footer{border-top:1px solid #ecebe9;padding:24px 20px;text-align:center;color:#999;font-size:12px}
footer b{color:#e5484d}
@media (max-width:720px){
  .hwrap{padding:12px 14px;gap:10px}
  .site{font-size:17px}
  .site img.site-logo{width:100px;height:auto}
  .site small{display:none}
  nav{gap:6px;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;padding-bottom:2px}
  nav a{padding:5px 10px;font-size:12px;white-space:nowrap;flex-shrink:0}
  nav::-webkit-scrollbar{display:none}
  .mrhx-search{order:3;width:100%;margin-left:0;justify-content:flex-end}
  .mrhx-search input{flex:1;width:auto}
  main{padding:18px 14px 32px}
  .upd{padding:12px 14px;font-size:13px}
  .post{flex-wrap:wrap;gap:12px;padding:14px}
  .date{width:52px;height:52px;border-radius:10px}
  .date b{font-size:19px}
  .ptitle{font-size:15px;word-break:break-word;line-height:1.5}
  .covers{flex:1 1 100%;order:3;overflow-x:auto;padding-bottom:2px}
  .covers img{width:54px;height:54px}
  .arrow{display:none}
}
</style>
<link rel="icon" href="favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="favicon.webp">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="logo.webp" alt="Tsinho黄油推荐站" class="site-logo"></a>
    <div class="site-header-right">
      <form class="mrhx-search" action="search.html" method="get">
      <input type="text" name="q" placeholder="搜索游戏…" autocomplete="off">
      <button type="submit">搜索</button>
    </form>
      <nav>${navLinks}</nav>
    </div>
  </div>
</header>
<main>
  <div class="upd"><span class="tag">游戏资源</span>本站点共上传了 <b>${totalGames}</b> 款游戏资源</div>
  <div class="sect"><h2>每日分享</h2><span>${days.length} 期</span></div>
  ${dayLis || '<div class="empty">暂无分享</div>'}
</main>
<footer>${SITE_FOOTER}</footer>
${popupHtml}
${topButton}
${SITE.comments.enabled && SITE.comments.url && SITE.comments.anonKey ? viewScript(SITE.comments.url.replace(/\/+$/, ''), SITE.comments.anonKey, '/index.html') : ''}
</body>
</html>
`;
  fs.writeFileSync('index.html', index);
  console.log('index.html ok, days:', days.length);

  fs.writeFileSync('search_index.json', JSON.stringify(searchIndex));
  console.log('search_index.json ok, games:', searchIndex.length);

  verify(days, index, searchIndex);

  const searchPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>搜索 · ${esc(SITE_NAME)}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
header{background:#fff;border-bottom:1px solid #ecebe9;position:sticky;top:0;z-index:10}
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
.result .rt b{font-size:16px;color:#2b2b2b}
.result .rt .src{font-size:11px;color:#fff;background:#e5484d;border-radius:99px;padding:2px 10px}
.result .intro{font-size:13px;color:#666;line-height:1.8;margin-bottom:10px;word-break:break-word}
.result .dl{display:flex;gap:8px;flex-wrap:wrap}
.result .img{margin-top:10px}
.result .img img{max-width:100%;border-radius:10px;border:1px solid #ecebe9}
.btn-dl{display:inline-flex;align-items:center;padding:8px 16px;border-radius:9px;font-size:13px;font-weight:600;text-decoration:none}
.btn-dl-m{background:#e5484d;color:#fff}
.btn-dl-b{background:#e6f4ea;color:#1a7f37;border:1px solid #b7e2c4}
.empty{text-align:center;color:#999;padding:40px 0;font-size:14px}
@media (max-width:720px){.hwrap{padding:12px 14px}.mrhx-search input{width:110px}main{padding:18px 14px 32px}}
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
    return '<div class="result"><div class="rt"><b>' + esc(g.title) + '</b><span class="src">' + esc(g.source) + '</span></div>' +
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
</html>
`;
  fs.writeFileSync('search.html', searchPage);
  console.log('search.html ok');

  const baseUrl = (SITE.site && SITE.site.url || 'https://tkporl.github.io/mrhyfx/').replace(/\/+$/, '');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/index.html</loc><priority>1.0</priority></url>
${days.map(d => {
    const t = TIMESTAMPS[path.parse(d.file).name] || new Date().toISOString();
    return `  <url><loc>${baseUrl}/${d.file}</loc><lastmod>${String(t).slice(0, 10)}</lastmod><priority>0.8</priority></url>`;
  }).join('\n')}
  <url><loc>${baseUrl}/search.html</loc><priority>0.4</priority></url>
</urlset>
`;
  fs.writeFileSync('sitemap.xml', sitemap);
  console.log('sitemap.xml ok');

  const rssItems = days.map(d => {
    const title = path.parse(d.file).name;
    const disp = TITLES[title] || title;
    const t = TIMESTAMPS[title] || new Date().toISOString();
    const desc = `共 ${d.gameCount} 款游戏，点击查看详情。`;
    return `    <item>
      <title>${esc(disp)}</title>
      <link>${baseUrl}/${d.file}</link>
      <guid isPermaLink="true">${baseUrl}/${d.file}</guid>
      <pubDate>${new Date(t).toUTCString()}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
  }).join('\n');
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(SITE_NAME)}</title>
    <link>${baseUrl}/index.html</link>
    <description>${esc(SITE_TAG)}</description>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${rssItems}
  </channel>
</rss>
`;
  fs.writeFileSync('rss.xml', rss);
  console.log('rss.xml ok');
})().catch(e => { console.error(e); process.exit(1); });
