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
    return `<a class="post" href="${d.file}">
  <div class="date">${date}</div>
  <div class="info">
    <div class="ptitle">${title}</div>
    <div class="pmeta">共 ${d.gameCount} 款游戏${plat ? ' · ' + plat : ''}</div>
  </div>
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
body{background:#f6f7fb;color:#333;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
header{background:#fff;border-bottom:1px solid #e5e6e8;position:sticky;top:0;z-index:10}
.hwrap{max-width:860px;margin:0 auto;padding:18px 20px;display:flex;align-items:center;gap:20px}
.site{font-size:22px;font-weight:800;color:#5856d5}
.site small{display:block;font-size:11px;font-weight:500;color:#888}
nav{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
nav a{padding:7px 14px;border-radius:99px;font-size:13px;color:#666;text-decoration:none;border:1px solid #e5e6e8;background:#fafafa;transition:.2s}
nav a:hover{color:#5856d5;border-color:#5856d5}
main{max-width:860px;margin:0 auto;padding:28px 20px 40px}
.sect{display:flex;align-items:baseline;gap:10px;margin-bottom:16px}
.sect h2{font-size:20px;color:#333}
.sect span{font-size:13px;color:#999}
.post{display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #e5e6e8;border-radius:14px;padding:18px 20px;margin-bottom:14px;text-decoration:none;transition:.2s}
.post:hover{border-color:#5856d5;transform:translateY(-2px);box-shadow:0 6px 20px rgba(88,86,213,.08)}
.date{flex-shrink:0;width:64px;height:64px;border-radius:14px;background:linear-gradient(135deg,#5856d5,#8b5cf6);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:700;line-height:1.2}
.date b{font-size:22px}
.date span{font-size:11px;opacity:.85}
.info{flex:1;min-width:0}
.ptitle{font-size:17px;font-weight:700;color:#333;margin-bottom:6px}
.pmeta{font-size:13px;color:#999}
.arrow{flex-shrink:0;color:#ccc;font-size:20px;transition:.2s}
.post:hover .arrow{color:#5856d5;transform:translateX(4px)}
.empty{text-align:center;color:#999;padding:40px 0}
footer{border-top:1px solid #e5e6e8;padding:24px 20px;text-align:center;color:#999;font-size:12px}
footer b{color:#dc9b04}
</style>
</head>
<body>
<header>
  <div class="hwrap">
    <span class="site">黄油分享<small>每日更新 · PC + 安卓双平台</small></span>
    <nav>${navLinks}</nav>
  </div>
</header>
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
