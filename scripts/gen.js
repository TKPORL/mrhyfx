const fs = require('fs');
const data = JSON.parse(fs.readFileSync('games.json', 'utf8'));
const { entries, extras } = data;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

const allTags = [...new Set(entries.flatMap(g => g.tags))];

const cards = entries.map((g, i) => {
  const tags = g.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('');
  const meta = [];
  if (g.version) meta.push(`<span class="meta"><span class="dot"></span>${esc(g.version)}</span>`);
  if (g.size) meta.push(`<span class="meta"><span class="dot"></span>${esc(g.size)}</span>`);
  const cheat = g.cheat ? `<div class="cheat" title="作弊码">作弊码 <b>${esc(g.cheat)}</b></div>` : '';
  const btns = g.links.map(l => {
    const cls = l.url.includes('pan.baidu.com') ? 'btn baidu' : 'btn mobile';
    return `<a class="${cls}" href="${escAttr(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a>`;
  }).join('');
  return `<article class="card" data-tags="${escAttr(g.tags.join(' '))}" data-name="${escAttr(g.title)}">
  <div class="cover"><img src="${escAttr(g.image)}" alt="${escAttr(g.title)}" loading="lazy" onerror="this.closest('.card').classList.add('noimg')"></div>
  <div class="body">
    <h3 class="name">${esc(g.title)}</h3>
    <div class="chips">${tags}</div>
    <div class="meta-row">${meta}</div>
    ${cheat}
    <div class="btns">${btns}</div>
  </div>
</article>`;
}).join('');

const tagChips = allTags.map(t => `<button class="tag-btn" data-tag="${escAttr(t)}">${esc(t)}</button>`).join('');

const nav = extras.map(e => `<a href="${escAttr(e.url)}" target="_blank" rel="noreferrer">${esc(e.label)}</a>`).join('');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>黄油分享 - 每日更新 PC+安卓</title>
<style>
:root{
  --bg:#0f1117; --panel:#181c26; --panel2:#1f2430; --line:#2a3040;
  --txt:#e8eaf0; --sub:#9aa3b5; --acc:#ff5c8a; --acc2:#8b5cf6; --green:#22c55e; --blue:#3b82f6;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
a{color:inherit;text-decoration:none}
header{position:sticky;top:0;z-index:50;background:rgba(15,17,23,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.nav{max-width:1200px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:22px}
.logo{font-size:20px;font-weight:800;background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent;white-space:nowrap}
.logo small{font-size:11px;font-weight:500;color:var(--sub);-webkit-text-fill-color:var(--sub)}
nav.links{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
nav.links a{padding:7px 14px;border-radius:99px;font-size:13px;color:var(--sub);border:1px solid transparent;transition:.2s}
nav.links a:hover{color:var(--txt);border-color:var(--line);background:var(--panel2)}
.hero{padding:48px 20px 30px;text-align:center;max-width:1200px;margin:0 auto}
.hero h1{font-size:clamp(26px,5vw,40px);font-weight:800;letter-spacing:1px}
.hero h1 span{background:linear-gradient(90deg,var(--acc),var(--acc2));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero p{margin-top:10px;color:var(--sub);font-size:14px}
.tools{max-width:1200px;margin:0 auto;padding:0 20px 8px;display:flex;flex-direction:column;gap:12px;align-items:center}
.search{width:min(560px,100%);position:relative}
.search input{width:100%;padding:12px 18px 12px 44px;border-radius:99px;border:1px solid var(--line);background:var(--panel2);color:var(--txt);font-size:14px;outline:none;transition:.2s}
.search input:focus{border-color:var(--acc)}
.search::before{content:'';position:absolute;left:16px;top:50%;width:16px;height:16px;transform:translateY(-50%);border:2px solid var(--sub);border-radius:50%}
.search::after{content:'';position:absolute;left:28px;top:calc(50% + 8px);width:8px;height:2px;background:var(--sub);transform:rotate(45deg)}
.tags{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
.tag-btn{padding:6px 14px;border-radius:99px;border:1px solid var(--line);background:transparent;color:var(--sub);font-size:12px;cursor:pointer;transition:.2s}
.tag-btn:hover{color:var(--txt);border-color:var(--acc)}
.tag-btn.active{background:var(--acc);border-color:var(--acc);color:#fff}
.count{max-width:1200px;margin:0 auto;padding:14px 20px 0;color:var(--sub);font-size:13px}
.grid{max-width:1200px;margin:0 auto;padding:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;transition:transform .2s,border-color .2s,opacity .2s}
.card:hover{transform:translateY(-4px);border-color:var(--acc)}
.card.hidden{display:none}
.cover{aspect-ratio:4/3;background:var(--panel2);overflow:hidden}
.cover img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}
.card:hover .cover img{transform:scale(1.04)}
.card.noimg .cover::after{content:'图片加载失败';display:flex;align-items:center;justify-content:center;height:100%;color:var(--sub);font-size:13px}
.body{padding:16px;display:flex;flex-direction:column;gap:10px;flex:1}
.name{font-size:16px;font-weight:700;line-height:1.4}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:11px;padding:3px 9px;border-radius:99px;background:rgba(139,92,246,.15);color:#c4b5fd;border:1px solid rgba(139,92,246,.35)}
.meta-row{display:flex;flex-wrap:wrap;gap:12px}
.meta{font-size:12px;color:var(--sub);display:flex;align-items:center;gap:6px}
.meta .dot{width:5px;height:5px;border-radius:50%;background:var(--green)}
.cheat{font-size:12px;color:var(--txt);background:rgba(255,92,138,.12);border:1px solid rgba(255,92,138,.4);border-radius:8px;padding:6px 10px}
.cheat b{color:var(--acc);font-size:13px;letter-spacing:1px}
.btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.btn{flex:1;min-width:110px;text-align:center;padding:9px 12px;border-radius:10px;font-size:13px;font-weight:600;transition:.2s}
.btn.mobile{background:var(--blue);color:#fff}
.btn.mobile:hover{background:#2563eb}
.btn.baidu{background:rgba(34,197,94,.12);color:var(--green);border:1px solid rgba(34,197,94,.4)}
.btn.baidu:hover{background:rgba(34,197,94,.25)}
.empty{display:none;text-align:center;color:var(--sub);padding:60px 20px;font-size:15px}
footer{margin-top:40px;border-top:1px solid var(--line);padding:26px 20px;text-align:center;color:var(--sub);font-size:12px;line-height:1.9}
footer a{color:var(--acc)}
</style>
</head>
<body>
<header>
  <div class="nav">
    <span class="logo">黄油分享<small> PC+安卓 每日更新</small></span>
    <nav class="links">${nav}</nav>
  </div>
</header>
<section class="hero">
  <h1>🎮 <span>黄油分享博客</span></h1>
  <p>精选单机成人向游戏 · PC + 安卓双平台 · 汉化步兵 · 不限速下载</p>
</section>
<div class="tools">
  <div class="search"><input id="q" type="text" placeholder="搜索游戏名称 / 标签…"></div>
  <div class="tags" id="tags">${tagChips}</div>
</div>
<div class="count">共 <b id="cnt">${entries.length}</b> 款游戏</div>
<main class="grid" id="grid">${cards}</main>
<div class="empty" id="empty">没有找到匹配的游戏</div>
<footer>
  本站内容来源于网络，仅供学习与交流使用，请于下载后 24 小时内删除，支持请购买正版。<br>
  若内容侵犯了您的权益，请联系删除。
</footer>
<script>
const q = document.getElementById('q');
const grid = document.getElementById('grid');
const empty = document.getElementById('empty');
const cnt = document.getElementById('cnt');
const btns = [...document.querySelectorAll('.tag-btn')];
let activeTag = '';
q.addEventListener('input', filter);
btns.forEach(b => b.addEventListener('click', () => {
  activeTag = activeTag === b.dataset.tag ? '' : b.dataset.tag;
  btns.forEach(x => x.classList.toggle('active', x === b && !!activeTag));
  filter();
}));
function filter(){
  const kw = q.value.trim().toLowerCase();
  let n = 0;
  grid.querySelectorAll('.card').forEach(c => {
    const okTag = !activeTag || c.dataset.tags.includes(activeTag);
    const okKw = !kw || c.dataset.name.toLowerCase().includes(kw) || c.dataset.tags.toLowerCase().includes(kw);
    const show = okTag && okKw;
    c.classList.toggle('hidden', !show);
    if (show) n++;
  });
  cnt.textContent = n;
  empty.style.display = n ? 'none' : 'block';
}
</script>
</body>
</html>
`;

fs.writeFileSync('index.html', html, 'utf8');
console.log('index.html written,', entries.length, 'games');
