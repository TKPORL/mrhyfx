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
    html = html.replace(/<body[^>]*>/, m => m + '\n  ' + backLink);
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
    return `<li class="node heading3">
    <div class="bullet">
    <div class="bullet-dot"></div>
  </div>
    <div class="content mm-editor"><a href="${d.file}" style="color:#4694FF;text-decoration:none;font-weight:500"><span>${title}</span></a></div>
    <div class="note mm-editor"><span>共 ${d.gameCount} 款游戏 · 点击进入</span></div>
  </li>`;
  }).join('\n');

  const index = `${newest.slice(0, headEnd)}
        <div class="title">黄油分享<span style="font-size:14px;font-weight:400;color:#888;margin-left:14px">每日分享 · 点击进入</span></div>
        <ul class="node-list">
        ${dayLis}
        ${extrasLis.join('\n        ')}
        </ul>
        ${newPublish}
      ${tail}`;
  fs.writeFileSync('index.html', index);
  console.log('index.html ok, days:', days.length);
})().catch(e => { console.error(e); process.exit(1); });
