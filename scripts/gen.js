const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const files = fs.readdirSync('.').filter(f => /\.html$/i.test(f) && f !== 'index.html' && f !== 'publish.html' && f !== 'Tsinhoht.html');
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

let SITE = { comments: { enabled: false, apiBase: '' } };
if (fs.existsSync('site.json')) {
  const s = readJson('site.json');
  SITE = Object.assign({}, SITE, s);
  SITE.comments = Object.assign({}, SITE.comments, s.comments || {});
}

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
  .mrhx-bar .mlogo{font-size:19px;font-weight:800;color:#2b2b2b;text-decoration:none;letter-spacing:1px;white-space:nowrap}
  .mrhx-bar .mlogo span{color:#e5484d}
  .mrhx-bar .mnav{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
  .mrhx-bar .mnav a{padding:6px 13px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
  .mrhx-bar .mnav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3;transform:translateY(-1px)}
  .mrhx-bar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #ecebe9;padding:12px 20px;display:flex;align-items:center;gap:18px;box-shadow:0 1px 6px rgba(0,0,0,.04)}
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
  .mrhx-btn-nav{background:#fff;color:#333;border:1px solid #e5e6e8}
  .mrhx-btn-nav:hover{border-color:#e5484d;color:#e5484d;box-shadow:0 4px 12px rgba(0,0,0,.08)}
  .mrhx-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;max-width:560px}
  .mrhx-grid .mrhx-btn{justify-content:center;text-align:center}
  @keyframes mrhxFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .node{animation:mrhxFade .5s ease both}
  @media (max-width:720px){
    body.narrow{padding-left:12px !important;padding-right:12px !important}
    .mrhx-bar{padding:10px 12px;gap:10px}
    .mrhx-bar .mlogo{font-size:16px}
    .mrhx-bar .mnav{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}
    .mrhx-bar .mnav a{padding:5px 10px;font-size:12px;white-space:nowrap}
    .mrhx-bar .mnav::-webkit-scrollbar{display:none}
    .mrhx-dl .mrhx-btn{flex:1 1 45%;text-align:center}
    .image-list .image{max-width:100% !important}
  }
  .mrhx-comments{max-width:100%;margin-top:34px;padding-top:22px;border-top:1px solid #ecebe9}
  .mrhx-comments h2{font-size:18px;color:#2b2b2b;margin-bottom:14px;display:flex;align-items:baseline;gap:8px}
  .mrhx-cnum{font-size:12px;color:#aaa;font-weight:400}
  .mrhx-citem{padding:14px 0;border-bottom:1px dashed #ecebe9}
  .mrhx-creply-item{margin-left:34px;padding:12px 0}
  .mrhx-chead{display:flex;align-items:center;gap:10px;margin-bottom:6px}
  .mrhx-cav{width:30px;height:30px;border-radius:50%;background:#fdf3f3;color:#e5484d;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .mrhx-cmeta{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .mrhx-cmeta b{font-size:13px;color:#333}
  .mrhx-ctime{font-size:11px;color:#bbb}
  .mrhx-ccontent{font-size:14px;color:#444;line-height:1.8;white-space:pre-wrap;word-break:break-word}
  .mrhx-cbar{margin-top:8px;display:flex;gap:8px}
  .mrhx-cbtn{border:none;background:none;color:#999;font-size:12px;cursor:pointer;padding:2px 6px;border-radius:6px}
  .mrhx-cbtn:hover{color:#e5484d;background:#fdf3f3}
  .mrhx-cdel{color:#c93a3f}
  .mrhx-cav-admin{background:#e5484d;color:#fff}
  .mrhx-cbadge{display:inline-block;background:#e5484d;color:#fff;font-size:10px;font-weight:600;padding:1px 7px;border-radius:99px;margin-left:4px}
  .mrhx-citem-admin{border-left:3px solid #e5484d;padding-left:10px}
  .mrhx-cempty{font-size:13px;color:#999;padding:10px 0}
  .mrhx-cform{margin-top:16px;background:#faf9f7;border:1px solid #ecebe9;border-radius:12px;padding:14px}
  .mrhx-crow{display:flex;gap:10px;margin-bottom:10px}
  .mrhx-crow input{flex:1;border:1px solid #e2e0dc;border-radius:8px;padding:9px 12px;font-size:13px;font-family:inherit;background:#fff;min-width:0}
  .mrhx-cform textarea{width:100%;border:1px solid #e2e0dc;border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;background:#fff;min-height:80px;resize:vertical;box-sizing:border-box}
  .mrhx-cform textarea:focus,.mrhx-crow input:focus{outline:none;border-color:#e5484d}
  .mrhx-csub{justify-content:space-between;align-items:center;margin-bottom:0}
  .mrhx-csub button{border:none;background:#e5484d;color:#fff;padding:9px 22px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
  .mrhx-csub button:hover{background:#c93a3f}
  .mrhx-csub button:disabled{opacity:.5;cursor:not-allowed}
  .mrhx-creply{font-size:12px;color:#e5484d}
  @media (max-width:720px){.mrhx-crow{flex-direction:column;margin-bottom:8px}}
  .mrhx-top{position:fixed;right:20px;bottom:24px;z-index:9999;width:44px;height:44px;border-radius:50%;background:#e5484d;color:#fff;font-size:20px;border:none;cursor:pointer;box-shadow:0 6px 18px rgba(229,72,77,.4);opacity:0;pointer-events:none;transition:.3s;line-height:1}
  .mrhx-top.show{opacity:1;pointer-events:auto}
  .mrhx-top:hover{transform:translateY(-3px);background:#c93a3f}
</style>`;

const topButton = `<button class="mrhx-top" id="mrhxTopBtn" onclick="window.scrollTo({top:0,behavior:'smooth'})" title="回到顶部">↑</button>
<script>
(function () {
  var b = document.getElementById('mrhxTopBtn');
  if (!b) return;
  function t() { b.classList.toggle('show', (window.scrollY || document.documentElement.scrollTop) > 400); }
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
    fetch('${sb}/rest/v1/rpc/inc_daily_view', { method: 'POST', headers: h, body: JSON.stringify({ p_url: '${path}', p_day: day }) }).catch(() => {});
    fetch('https://ip-api.com/json/?fields=country,regionName,city&lang=zh-CN')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (g) {
        if (!g || !g.country) return;
        fetch('${sb}/rest/v1/rpc/inc_geo_view', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({ p_url: '${path}', p_day: day, p_country: g.country || '未知', p_region: g.regionName || '未知', p_city: g.city || '未知' })
        }).catch(function () {});
      }).catch(function () {});
  } catch (e) {}
})();
</script>`;

const staggered = Array.from({ length: 20 }, (_, i) => `.node:nth-child(${i + 1}){animation-delay:${i * 0.05}s}`).join('\n');

function dayTag(file) {
  const m = file.match(/(\d+)月(\d+)/);
  return m ? `${m[1]}月${m[2]}` : path.parse(file).name;
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
  while ((m = re.exec(noteHtml)) !== null) links.push({ url: m[1], label: m[2] });
  return links;
}

function rebuildNote(noteHtml) {
  const links = extractLinks(noteHtml);
  let plain = noteHtml.replace(/<a[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]+>/g, '');
  plain = plain.replace(/下载链接/g, '').replace(/移动（不限速）：/g, '').replace(/度盘：/g, '');
  plain = plain.replace(/[\s\u200b\u200c]+/g, ' ').trim();
  const btns = links.map(l => {
    const name = l.url.includes('pan.baidu.com') ? '百度网盘'
      : l.url.includes('yun.139.com') ? '移动云盘（不限速）' : l.label;
    const cls = l.url.includes('pan.baidu.com') ? 'mrhx-btn mrhx-btn-b' : 'mrhx-btn mrhx-btn-m';
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
.site{font-size:19px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none}
.site img.site-logo{width:28px;height:28px;border-radius:5px;vertical-align:middle;display:inline-block}
.site em{font-style:normal;color:#e5484d}
.site small{font-size:11px;font-weight:400;color:#999;display:block;letter-spacing:0}
nav{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
nav a{padding:6px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7}
nav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
main{max-width:900px;margin:0 auto;padding:60px 20px;text-align:center;color:#999}
footer{border-top:1px solid #ecebe9;padding:24px 20px;text-align:center;color:#999;font-size:12px}
footer b{color:#e5484d}
@media (max-width:720px){.hwrap{padding:12px 14px}nav{gap:6px}nav a{padding:5px 10px;font-size:12px}}
</style>
<link rel="icon" href="favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="favicon.webp">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="logo.webp" alt="Tsinho黄油推荐站" class="site-logo"></a>
    <nav>${navLinks}</nav>
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

const days = [];
(async () => {
  for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    const computed = (html.match(/<li class="node[^"]*heading/g) || []).length;
    const tag = dayTag(file);
    const gameCount = overrides[tag] !== undefined ? overrides[tag] : computed;

    html = await localize(html, tag);

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
      var depth = 0, i = h3 + 27;
      while (i < inner.length) {
        if (inner.indexOf('<li', i) === i) depth++;
        if (inner.indexOf('</li>', i) === i) { if (depth === 0) { blocks.push(inner.slice(h3, i + 5)); pos = i + 5; break; } depth--; i += 5; continue; }
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
  <a class="mlogo" href="index.html">黄油<span>分享</span></a>
  <div class="mnav">${navPills}</div>
</div>`;
    const injected = `<!--mrhx-->\n${sharedCss}\n${bar}\n<!--mrhx-end-->`;
    html = html.replace(/<body([^>]*)>/, (m, a) => a.includes('class') ? m : `<body class="narrow">`);
    html = html.replace(/(<body[^>]*>)[\s\S]*?(<div class="title">)/, `$1\n  ${injected}\n  $2`);
    html = html.replace(/\s*<!--mrhx-stagger--><style>[\s\S]*?<\/style>\s*/g, '\n');
    html = html.replace('</body>', `  <!--mrhx-stagger--><style>\n${staggered}\n</style>\n  </body>`);
    const shortName = path.parse(file).name;
    const dispTitle = TITLES[shortName] || shortName;
    html = html.replace(/<div class="title">[\s\S]*?<\/div>/, `<div class="title">${esc(dispTitle)}</div>`);
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(dispTitle)} · ${esc(SITE_NAME)}</title>`);
    html = html.replace('</head>', `<link rel="icon" href="favicon.webp" type="image/webp">
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
    <div class="mrhx-crow">
      <input type="text" id="mrhx-nick" placeholder="昵称" maxlength="30" required>
      <input type="email" id="mrhx-mail" placeholder="邮箱（仅后台可见）" required>
    </div>
    <textarea id="mrhx-ctext" placeholder="友善评论，请支持正版…" required></textarea>
    <div class="mrhx-crow mrhx-csub">
      <span id="mrhx-creply" class="mrhx-creply"></span>
      <button type="submit">发表评论</button>
    </div>
  </form>
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
  var replyEl = document.getElementById('mrhx-creply');
  var replyPid = null;
  var all = [];
  function h(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; }
  function headers() {
    return { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' };
  }
  function render() {
    list.textContent = '';
    document.getElementById('mrhx-cnum').textContent = all.length ? '（' + all.length + ' 条）' : '';
    function addRow(c) {
      var row = h('div', 'mrhx-citem' + (c.pid ? ' mrhx-creply-item' : '') + (c.is_admin ? ' mrhx-citem-admin' : ''));
      var head = h('div', 'mrhx-chead');
      head.appendChild(h('span', 'mrhx-cav' + (c.is_admin ? ' mrhx-cav-admin' : ''), String(c.nick || '匿')[0].toUpperCase()));
      var meta = h('div', 'mrhx-cmeta');
      meta.appendChild(h('b', '', c.nick || '匿名'));
      if (c.is_admin) meta.appendChild(h('span', 'mrhx-cbadge', '站长'));
      meta.appendChild(h('span', 'mrhx-ctime', new Date(c.created_at).toLocaleString()));
      head.appendChild(meta);
      row.appendChild(head);
      row.appendChild(h('div', 'mrhx-ccontent', c.content));
      var bar = h('div', 'mrhx-cbar');
      var topId = c.pid || c.id;
      var rp = h('button', 'mrhx-cbtn', '回复');
      rp.onclick = function () {
        if (replyPid === topId) { replyPid = null; replyEl.textContent = ''; }
        else { replyPid = topId; replyEl.textContent = '回复楼层：' + (c.nick || '匿名') + '（再次点击取消）'; }
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
      }
      row.appendChild(bar);
      list.appendChild(row);
    }
    function addTree(pid) {
      all.filter(function (c) { return (c.pid || null) === pid; })
        .sort(function (a, b) { return a.created_at.localeCompare(b.created_at); })
        .forEach(function (c) { addRow(c); addTree(c.id); });
    }
    addTree(null);
    if (!all.length) list.appendChild(h('p', 'mrhx-cempty', '还没有评论，来说两句吧'));
  }
  function load() {
    fetch(SB + '/rest/v1/comments?url=eq.' + encodeURIComponent(PATH) + '&select=id,pid,nick,is_admin,content,created_at&order=created_at.asc', { headers: headers() })
      .then(function (r) { if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + (t ? '：' + t.slice(0, 200) : '')); }); return r.json(); })
      .then(function (d) { all = d || []; render(); })
      .catch(function (e) { list.textContent = '评论加载失败（' + e.message + '），请稍后再试'; });
  }
  form.onsubmit = function (e) {
    e.preventDefault();
    var nick = nickEl.value.trim(), mail = mailEl.value.trim(), content = textEl.value.trim();
    if (!nick || !mail || !content) { alert('请填写昵称、邮箱和内容'); return; }
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(mail)) { alert('邮箱格式不正确'); return; }
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '发送中…';
    fetch(SB + '/rest/v1/comments', {
      method: 'POST',
      headers: Object.assign(headers(), { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }),
      body: JSON.stringify({ url: PATH, nick: nick, email: mail, content: content, pid: replyPid || null })
    }).then(function (r) {
      if (r.status === 400) return r.json().then(function (d) { throw new Error((d && (d.message || d.details)) || '内容未通过检查'); });
      if (!r.ok) throw new Error('HTTP ' + r.status);
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
    html = html.replace('</body>', `  ${topBtn}\n  ${commentBlock}${commentBlock ? '\n  ' : ''}${vb}\n  <!--mrhx-stagger--><style>\n${staggered}\n</style>\n  </body>`);

    fs.writeFileSync(file, html);
    console.log('day page ok:', file, '(' + gameCount + ' 款游戏)');
    days.push({ file, gameCount, tag });
  }

  days.sort((a, b) => {
    const ka = path.parse(a.file).name, kb = path.parse(b.file).name;
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
    const plat = /安卓/.test(title) ? 'PC + 安卓' : /PC/i.test(title) ? 'PC' : '';
    const dateM = title.match(/(\d+)月(\d+)/);
    const dateN = title.match(/(\d+)\.(\d+)/);
    const badge = dateM ? `<b>${dateM[2]}</b><span>${dateM[1]}月</span>`
      : dateN ? `<b>${dateN[2]}</b><span>${dateN[1]}月</span>`
      : `<b style="font-size:13px">${esc(disp)}</b>`;
    const dayHtml = fs.readFileSync(d.file, 'utf8');
    const covers = [...new Set([...dayHtml.matchAll(/src="(assets\/[^"]+)"/g)].map(m => m[1]))].slice(0, 5)
      .map(src => `<img src="${src}" alt="" loading="lazy">`).join('');
    return `<a class="post" href="${d.file}" style="animation-delay:${di * 0.1}s">
  <div class="date">${badge}</div>
  <div class="info">
    <div class="ptitle">${esc(disp)}</div>
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
.site{font-size:21px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none}
.site img.site-logo{width:34px;height:34px;border-radius:6px;vertical-align:middle;display:inline-block}
.site em{font-style:normal;color:#e5484d}
.site small{font-size:11px;font-weight:400;color:#999;display:block;letter-spacing:0}
.site small{display:block;font-size:11px;font-weight:400;color:#999;letter-spacing:0}
nav{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
nav a{padding:7px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
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
.covers{display:flex;gap:8px;flex-shrink:0}
.covers img{width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #ecebe9;transition:.25s}
.post:hover .covers img{transform:translateY(-2px)}
.arrow{flex-shrink:0;color:#d5d2cc;font-size:20px;transition:.2s}
.post:hover .arrow{color:#e5484d;transform:translateX(5px)}
.empty{text-align:center;color:#999;padding:40px 0}
footer{border-top:1px solid #ecebe9;padding:24px 20px;text-align:center;color:#999;font-size:12px}
footer b{color:#e5484d}
@media (max-width:720px){
  .hwrap{padding:12px 14px;gap:10px;flex-wrap:nowrap}
  .site{font-size:17px}
  .site small{display:none}
  nav{margin-left:auto;gap:6px;flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;padding-bottom:2px}
  nav a{padding:5px 10px;font-size:12px;white-space:nowrap;flex-shrink:0}
  nav::-webkit-scrollbar{display:none}
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
    <nav>${navLinks}</nav>
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
})().catch(e => { console.error(e); process.exit(1); });