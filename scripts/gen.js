const fs = require('fs');
const path = require('path');

const files = fs.readdirSync('.').filter(f => /\.html$/i.test(f) && f !== 'index.html');
if (!files.length) { console.error('未找到每日分享导出文件'); process.exit(1); }

const PUBLISH_RE = /<div class="publish"[\s\S]*?<\/div>/;
const newPublish = `<div class="publish" style="display: flex; align-items: center; justify-content: center;">
        <span>by&nbsp;</span>
        <span style="color:#dc9b04">Tsinho</span>
        <span>&nbsp;发布&nbsp;·&nbsp;本站仅供学习交流，请支持正版</span>
      </div>`;

const backLink = `<div style="padding-left:10px;margin-bottom:16px;font-size:14px;"><a href="index.html" style="color:#4694FF;text-decoration:none">← 返回首页</a></div>`;

const responsive = `<style>
  body.narrow{max-width:920px}
  .image-list .image{width:100% !important;height:auto !important;max-width:680px !important}
  .image-row{justify-content:center}
  @media (max-width:960px){body.narrow{max-width:100%}}
</style>`;

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

const days = [];
(async () => {
  for (const file of files) {
    let html = fs.readFileSync(file, 'utf8');
    const gameCount = (html.match(/<li class="node[^"]*heading/g) || []).length;
    html = await localize(html, dayTag(file));
    html = html.replace(PUBLISH_RE, newPublish);
    html = html.replace(/<body[^>]*>/, '<body class="narrow">\n  ' + responsive + '\n  ' + backLink);
    fs.writeFileSync(file, html);
    console.log('day page ok:', file, '(' + gameCount + ' 款游戏)');
    days.push({ file, gameCount });
  }

  days.sort((a, b) => {
    const ma = a.file.match(/(\d+)月(\d+)/), mb = b.file.match(/(\d+)月(\d+)/);
    if (ma && mb) return (mb[1] - ma[1]) * 100 + (mb[2] - ma[2]);
    return b.file.localeCompare(a.file);
  });

  const newest = fs.readFileSync(days[0].file, 'utf8');
  const headEnd = newest.indexOf('>', newest.indexOf('<body')) + 1;
  const tail = newest.slice(newest.lastIndexOf('</body>'));

  const parts = newest.split(/<li class="node/);
  const extrasLis = [];
  for (let i = 1; i < parts.length; i++) {
    if (/heading/.test(parts[i].slice(0, 80))) continue;
    const end = parts[i].lastIndexOf('</li>');
    if (end < 0) continue;
    extrasLis.push('<li class="node' + parts[i].slice(0, end + 5).trim());
  }

  const dayLis = days.map(d => {
    const title = path.parse(d.file).name;
    const plat = /安卓/.test(title) ? 'PC + 安卓' : /PC/i.test(title) ? 'PC' : '';
    const dateM = title.match(/(\d+)月(\d+)/);
    const date = dateM ? `${dateM[1]}月${dateM[2]}` : '';
    const dayHtml = fs.readFileSync(d.file, 'utf8');
    const covers = [...new Set([...dayHtml.matchAll(/src="(assets\/[^"]+)"/g)].map(m => m[1]))].slice(0, 5)
      .map(src => `<img src="${src}" alt="" loading="lazy">`).join('');
    return `<a class="post" href="${d.file}">
  <div class="date"><b>${dateM ? dateM[2] : '·'}</b><span>${dateM ? dateM[1] + '月' : ''}</span></div>
  <div class="info">
    <div class="ptitle">${title}</div>
    <div class="pmeta">共 ${d.gameCount} 款游戏${plat ? ' · ' + plat : ''}</div>
  </div>
  ${covers ? `<div class="covers">${covers}</div>` : ''}
  <div class="arrow">→</div>
</a>`;
  }).join('\n');

  const navLinks = extrasLis.map(l => {
    const href = /href="([^"]+)"/.exec(l);
    const label = /content-link-text">([^<]*)</.exec(l);
    return href && label ? `<a href="${href[1]}" target="_blank" rel="noreferrer">${label[1]}</a>` : '';
  }).join('');

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
.site{font-size:21px;font-weight:800;letter-spacing:1px;color:#2b2b2b}
.site em{font-style:normal;color:#e5484d}
.site small{display:block;font-size:11px;font-weight:400;color:#999;letter-spacing:0}
nav{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
nav a{padding:7px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #ecebe9;background:#faf9f7;transition:.2s}
nav a:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
.hero{max-width:900px;margin:0 auto;padding:44px 20px 8px}
.hero h1{font-size:34px;font-weight:800;letter-spacing:2px}
.hero h1 span{color:#e5484d}
.hero p{margin-top:10px;color:#888;font-size:14px}
main{max-width:900px;margin:0 auto;padding:24px 20px 44px}
.sect{display:flex;align-items:baseline;gap:10px;margin-bottom:18px}
.sect h2{font-size:19px;color:#2b2b2b;position:relative;padding-left:12px}
.sect h2::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:#e5484d}
.sect span{font-size:13px;color:#aaa}
.post{display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #ecebe9;border-radius:14px;padding:18px 20px;margin-bottom:14px;text-decoration:none;transition:.2s;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.post:hover{border-color:#f0b4b6;transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.06)}
.date{flex-shrink:0;width:62px;height:62px;border-radius:12px;background:#e5484d;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1}
.date b{font-size:22px;font-weight:700}
.date span{font-size:11px;opacity:.85}
.info{flex:1;min-width:0}
.ptitle{font-size:17px;font-weight:700;color:#2b2b2b;margin-bottom:6px}
.pmeta{font-size:13px;color:#999}
.covers{display:flex;gap:8px;flex-shrink:0}
.covers img{width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #ecebe9}
.arrow{flex-shrink:0;color:#d5d2cc;font-size:20px;transition:.2s}
.post:hover .arrow{color:#e5484d;transform:translateX(4px)}
.empty{text-align:center;color:#999;padding:40px 0}
footer{border-top:1px solid #ecebe9;padding:24px 20px;text-align:center;color:#999;font-size:12px}
footer b{color:#e5484d}
</style>
</head>
<body>
<header>
  <div class="hwrap">
    <span class="site">黄油<em>分享</em><small>每日更新 · PC + 安卓双平台</small></span>
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
