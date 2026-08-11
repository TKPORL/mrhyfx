const fs = require('fs');
const path = require('path');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const files = fs.readdirSync('.').filter(f => /\.html$/i.test(f) && f !== 'index.html');
if (!files.length) { console.error('未找到每日分享导出文件'); process.exit(1); }

let overrides = {};
if (fs.existsSync('counts.json')) overrides = JSON.parse(fs.readFileSync('counts.json', 'utf8'));

const PUBLISH_RE = /<div class="publish"[\s\S]*?<\/div>/;
const newPublish = `<div class="publish" style="display: flex; align-items: center; justify-content: center;">
        <span>by&nbsp;</span>
        <span style="color:#dc9b04">Tsinho</span>
        <span>&nbsp;发布&nbsp;·&nbsp;本站仅供学习交流，请支持正版</span>
      </div>`;

const sharedCss = `<style>
  .mrhx-bar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #ecebe9;padding:12px 20px;display:flex;align-items:center;gap:18px;max-width:100%;box-shadow:0 1px 6px rgba(0,0,0,.04)}
  .mrhx-bar .mlogo{font-size:19px;font-weight:800;color:#2b2b2b;text-decoration:none;letter-spacing:1px;white-space:nowrap}
  .mrhx-bar .mlogo span{color:#e5484d}
  .mrhx-bar .mnav{display:flex;gap:8px;flex-wrap:wrap;margin-left:auto}
  .mrhx-bar .mnav a{padding:6px 13px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
  .mrhx-bar .mnav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3;transform:translateY(-1px)}
  .mrhx-dl{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
  .mrhx-btn{display:inline-flex;align-items:center;padding:9px 18px;border-radius:10px;font-size:14px;font-weight:600;text-decoration:none;border:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
  .mrhx-btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.12)}
  .mrhx-btn-m{background:#e5484d;color:#fff}
  .mrhx-btn-m:hover{background:#c93a3f}
  .mrhx-btn-b{background:#e6f4ea;color:#1a7f37;border:1px solid #b7e2c4}
  .mrhx-btn-b:hover{background:#d8edde}
  .mrhx-btn-nav{background:#fff;color:#333;border:1px solid #e5e6e8}
  .mrhx-btn-nav:hover{border-color:#e5484d;color:#e5484d;box-shadow:0 4px 12px rgba(0,0,0,.08)}
  @keyframes mrhxFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .node{animation:mrhxFade .5s ease both}
</style>`;

const staggered = Array.from({ length: 20 }, (_, i) => `.node:nth-child(${i + 1}){animation-delay:${i * 0.05}s}`).join('\n');

function dayTag(file) {
  const m = file.match(/(\d+)月(\d+)/);
  return m ? `${m[1]}月${m[2]}` : path.parse(file).name;
}

async function localize(html, tag) {
  const urls = [...new Set([...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map(m => m[1]))];
  if (!urls.length) return html;
  const dir = path.join('assets', tag);
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const url of urls) {
    const name = `img_${String(++n).padStart(2, '0')}.png`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`下载失败 ${url} (HTTP ${res.status})`);
    fs.writeFileSync(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
    html = html.split(url).join(`assets/${tag}/${name}`);
    console.log('  img', tag, name);
  }
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
  const parts = html.split(/<li class="node/);
  const out = [];
  for (let i = 1; i < parts.length; i++) {
    if (/heading/.test(parts[i].slice(0, 80))) continue;
    const end = parts[i].lastIndexOf('</li>');
    if (end < 0) continue;
    out.push('<li class="node' + parts[i].slice(0, end + 5).trim());
  }
  return out;
}

const days = [];
(async () => {
  for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    const computed = (html.match(/<li class="node[^"]*heading/g) || []).length;
    const tag = dayTag(file);
    const gameCount = overrides[tag] !== undefined ? overrides[tag] : computed;

    html = await localize(html, tag);

    const extras = extractExtras(html);

    html = html.replace(/<div class="note mm-editor">([\s\S]*?)<\/div>/g,
      (m, inner) => inner.includes('mrhx-dl') ? m
        : '<div class="note mm-editor">' + rebuildNote(inner) + '</div>');

    html = html.replace(/<div class="content mm-editor[^"]*"[^>]*><a class="content-link"[^>]*href="([^"]+)"[^>]*><span class="content-link-text">([^<]*)<\/span><\/a><\/div>/g,
      (m, url, label) => `<div class="content mm-editor" ><a class="mrhx-btn mrhx-btn-nav" href="${esc(url)}" target="_blank" rel="noreferrer">${label}</a></div>`);

    html = html.replace(PUBLISH_RE, newPublish);

    const navPills = [`<a href="index.html">首页</a>`, ...extras.map(e => {
      const href = /href="([^"]+)"/.exec(e);
      const label = /content-link-text">([^<]*)</.exec(e);
      return href && label ? `<a href="${href[1]}" target="_blank" rel="noreferrer">${label[1]}</a>` : '';
    })].filter(Boolean).join('\n    ');
    const bar = `<div class="mrhx-bar">
  <a class="mlogo" href="index.html">黄油<span>分享</span></a>
  <div class="mnav">${navPills}</div>
</div>`;
    const injected = `<!--mrhx-->\n${sharedCss}\n${bar}\n<!--mrhx-end-->`;
    html = html.replace(/(<body[^>]*>)[\s\S]*?(<div class="title">)/, `$1\n  ${injected}\n  $2`);
    html = html.replace('</body>', `<style>\n${staggered}\n</style>\n  </body>`);

    fs.writeFileSync(file, html);
    console.log('day page ok:', file, '(' + gameCount + ' 款游戏)');
    days.push({ file, gameCount, tag });
  }

  days.sort((a, b) => {
    const ma = a.file.match(/(\d+)月(\d+)/), mb = b.file.match(/(\d+)月(\d+)/);
    if (ma && mb) return (mb[1] - ma[1]) * 100 + (mb[2] - ma[2]);
    return b.file.localeCompare(a.file);
  });

  const newest = fs.readFileSync(days[0].file, 'utf8');
  const headEnd = newest.indexOf('>', newest.indexOf('<body')) + 1;
  const extras = extractExtras(newest);

  const navLinks = extras.map(e => {
    const href = /href="([^"]+)"/.exec(e);
    const label = /content-link-text">([^<]*)</.exec(e);
    return href && label ? `<a href="${href[1]}" target="_blank" rel="noreferrer">${label[1]}</a>` : '';
  }).join('');

  const dayLis = days.map((d, di) => {
    const title = path.parse(d.file).name;
    const plat = /安卓/.test(title) ? 'PC + 安卓' : /PC/i.test(title) ? 'PC' : '';
    const dateM = title.match(/(\d+)月(\d+)/);
    const dayHtml = fs.readFileSync(d.file, 'utf8');
    const covers = [...new Set([...dayHtml.matchAll(/src="(assets\/[^"]+)"/g)].map(m => m[1]))].slice(0, 5)
      .map(src => `<img src="${src}" alt="" loading="lazy">`).join('');
    return `<a class="post" href="${d.file}" style="animation-delay:${di * 0.1}s">
  <div class="date"><b>${dateM ? dateM[2] : '·'}</b><span>${dateM ? dateM[1] + '月' : ''}</span></div>
  <div class="info">
    <div class="ptitle">${title}</div>
    <div class="pmeta">共 ${d.gameCount} 款游戏${plat ? ' · ' + plat : ''}</div>
  </div>
  ${covers ? `<div class="covers">${covers}</div>` : ''}
  <div class="arrow">→</div>
</a>`;
  }).join('\n');

  const index = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>黄油分享 · 每日更新</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
header{background:#fff;border-bottom:1px solid #ecebe9;position:sticky;top:0;z-index:10}
.hwrap{max-width:900px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;gap:20px}
.site{font-size:21px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none}
.site em{font-style:normal;color:#e5484d}
.site small{display:block;font-size:11px;font-weight:400;color:#999;letter-spacing:0}
nav{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
nav a{padding:7px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
nav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3;transform:translateY(-1px)}
.hero{max-width:900px;margin:0 auto;padding:44px 20px 8px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:2px;animation:mrhxDrop .6s ease both}
.hero h1 span{color:#e5484d}
.hero p{margin-top:10px;color:#888;font-size:14px;animation:mrhxDrop .6s ease .1s both}
@keyframes mrhxDrop{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:none}}
@keyframes mrhxCard{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
main{max-width:900px;margin:0 auto;padding:24px 20px 44px}
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
</style>
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html">黄油<em>分享</em><small>每日更新 · PC + 安卓双平台</small></a>
    <nav>${navLinks}</nav>
  </div>
</header>
<section class="hero">
  <h1>今日黄油<span>分享</span></h1>
  <p>精选单机成人向游戏 · PC + 安卓双平台 · 汉化步兵 · 不限速下载</p>
</section>
<main>
  <div class="sect"><h2>每日分享</h2><span>${days.length} 期</span></div>
  ${dayLis || '<div class="empty">暂无分享</div>'}
</main>
<footer>by <b>Tsinho</b> 发布 · 本站仅供学习交流，请于下载后 24 小时内删除，支持正版</footer>
</body>
</html>
`;
  fs.writeFileSync('index.html', index);
  console.log('index.html ok, days:', days.length);
})().catch(e => { console.error(e); process.exit(1); });