const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execSync } = require('child_process');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

const POST_DIR = '.';
const files = fs.readdirSync(POST_DIR).filter(f => /\.html$/i.test(f) && f !== 'index.html' && f !== 'publish.html' && f !== 'Tsinhoht.html' && f !== 'search.html' && f !== 'email-preview.html' && f !== 'comments-preview.html' && f !== 'site-preview.html' && f !== 'jinri.html' && f !== '404.html');
if (!files.length) console.warn('未找到每日分享导出文件，将生成空首页');

// 支持命令行传版本号：node scripts/gen.js v2026.8.24
const NEW_TAG = process.argv[2] || null;
if (NEW_TAG && NEW_TAG !== 'auto') {
  const genFile = fs.readFileSync(__filename, 'utf8');
  const updated = genFile.replace(
    /const CDN_URL = 'https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^']+'/,
    `const CDN_URL = 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@${NEW_TAG}'`
  );
  if (updated !== genFile) {
    fs.writeFileSync(__filename, updated, 'utf8');
    console.log(`CDN_URL updated to @${NEW_TAG}`);
  }
}

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

let ICONS = {};
if (fs.existsSync('icons.json')) {
  const ic = readJson('icons.json');
  if (ic && typeof ic === 'object') ICONS = ic;
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
let CDN_URL = 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main';
const GRID2_POSTS = new Set(files.map(f => path.parse(f).name));

// ===== SEO =====
const SITE_URL = ((SITE.seo && SITE.seo.url) || 'https://tkporl.github.io/mrhyfx/').replace(/\/+$/, '') + '/';
const SEO_DESCRIPTION = (SITE.seo && SITE.seo.description) ||
  'Tsinho黄油站（Tsinho黄油推荐站·Tsinho工作室）每日更新：PC+安卓双平台黄油游戏分享，AI汉化、官方中文，移动云盘与百度网盘直达下载，支持游戏求助与补档。';
const SEO_KEYWORDS = (SITE.seo && Array.isArray(SITE.seo.keywords) && SITE.seo.keywords.length)
  ? SITE.seo.keywords
  : [
    // 品牌
    'Tsinho黄油站', 'Tsinho', 'tsinho', 'TSINHO', 'Tsinho工作室', 'Tsinho黄油推荐站', 'tsinho黄油站', '黄油推荐站',
    // 品类通用
    '黄油', '黄油站', '黄油分享', '黄油游戏', '每日黄油分享', '黄油单机', '绅士游戏', '绅士黄油', '绅士游戏下载',
    '里番游戏', 'ERO游戏', 'eroge', '成人游戏', '18禁游戏', 'R18游戏', '涩涩游戏', 'galgame',
    // 平台/语言
    'PC黄油', '安卓黄油', 'PC安卓黄油', 'PC单机黄油', '手机黄油', '安卓手机黄油', '中文黄油', '官中黄油',
    '官方中文黄油', '汉化黄油', 'AI汉化黄油', 'AI汉化游戏', '生肉黄油',
    // 类型/玩法
    'RPG黄油', 'SLG黄油', 'ADV黄油', '动态CG黄油', 'NTR黄油', '像素黄油', '3D黄油',
    // 搜索意图
    '黄油下载', '黄油下载站', '黄油网盘下载', '百度网盘黄油', '移动云盘黄油', '免费黄油', '黄油分享网站',
    '每日更新黄油', '黄油合集', '黄油补档', '黄油求助', '黄油资源', '游戏资源分享', '汉化游戏', '单机游戏', '黄油网站推荐'
  ];
function seoHead(file, pageTitle) {
  const t = pageTitle ? `${pageTitle} · ${SITE_NAME}` : `${SITE_NAME} · 每日更新`;
  const url = file ? SITE_URL + file : SITE_URL;
  const V = (SITE.seo && SITE.seo.verification) || {};
  const verif = [
    V.google && `<meta name="google-site-verification" content="${esc(V.google)}">`,
    V.bing && `<meta name="msvalidate.01" content="${esc(V.bing)}">`,
    V.baidu && `<meta name="baidu-site-verification" content="${esc(V.baidu)}">`,
    V.sogou && `<meta name="sogou_site_verification" content="${esc(V.sogou)}">`,
    V.yandex && `<meta name="yandex-verification" content="${esc(V.yandex)}">`
  ].filter(Boolean).join('\n');
  return [
    `<meta name="description" content="${esc(SEO_DESCRIPTION)}">`,
    `<meta name="keywords" content="${SEO_KEYWORDS.map(esc).join(',')}">`,
    `<meta name="author" content="${esc(SITE_AUTHOR)}">`,
    `<meta name="robots" content="index,follow">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(t)}">`,
    `<meta property="og:description" content="${esc(SEO_DESCRIPTION)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${CDN_URL}/logo.webp">`,
    verif
  ].filter(Boolean).join('\n');
}

const nodeExpandScript = `<!--mrhx-expand--><script>
(function () {
  document.querySelectorAll('.node.heading3').forEach(function (n) {
    if (n.classList.contains('node-full')) return;
    var img = n.querySelector('.image-list img');
    if (!img) return;
    var tip = document.createElement('span');
    tip.className = 'img-tip';
    tip.textContent = '点击图片查看完整介绍';
    n.appendChild(tip);
    var collapseBtn = document.createElement('span');
    collapseBtn.className = 'exp-hint';
    collapseBtn.textContent = '收起 ↑';
    collapseBtn.style.display = 'none';
    n.appendChild(collapseBtn);
    img.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var on = !n.classList.contains('exp');
      n.classList.toggle('exp', on);
      collapseBtn.style.display = on ? 'inline-block' : 'none';
    });
    collapseBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      n.classList.remove('exp');
      collapseBtn.style.display = 'none';
    });
  });
})();
</script>
`;

const PUBLISH_RE = /<div class="publish"[\s\S]*?<\/div>/;
const newPublish = `<div class="publish" style="display: flex; align-items: center; justify-content: center;">
        <span>by&nbsp;</span>
        <span style="color:#dc9b04">${SITE_AUTHOR}</span>
        <span>&nbsp;发布&nbsp;·&nbsp;本站仅供学习交流，请支持正版</span>
      </div>`;

const sharedCss = `<style>
  body.narrow{max-width:900px !important;margin-left:auto !important;margin-right:auto !important;padding-left:24px !important;padding-right:24px !important;padding-top:120px !important}
  .mrhx-bar{position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;border-bottom:1px solid #ecebe9;padding:16px 20px;display:flex;align-items:center;gap:20px;box-shadow:0 1px 6px rgba(0,0,0,.04)}
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
    .mrhx-bar{max-width:900px !important;margin-left:auto !important;margin-right:auto !important;border-radius:0 0 14px 14px;border-left:1px solid #ecebe9;border-right:1px solid #ecebe9}
  }
  .mrhx-dl{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
  .mrhx-btn{display:inline-flex;align-items:center;padding:7px 14px;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;border:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
  .mrhx-btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.12)}
  .mrhx-btn-m{background:#e5484d;color:#fff}
  .mrhx-btn-m:hover{background:#c93a3f}
  .mrhx-btn-b{background:#e6f4ea;color:#1a7f37;border:1px solid #b7e2c4}
  .mrhx-btn-b:hover{background:#d8edde}
  .mrhx-btn-qk{background:#6366f1;color:#fff}
  .mrhx-btn-qk:hover{background:#4f46e5}
  .mrhx-btn-nav{background:#fff;color:#333;border:1px solid #e5e6e8}
  .mrhx-btn-nav:hover{border-color:#e5484d;color:#e5484d;box-shadow:0 4px 12px rgba(0,0,0,.08)}
  .mrhx-grid{display:flex;flex-wrap:wrap;gap:10px;max-width:560px}
  .mrhx-grid .mrhx-btn{justify-content:center;text-align:center}
  @keyframes mrhxFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}    .node{animation:mrhxFade .5s ease both;position:relative;background:#fff;border:1px solid #ecebe9;border-radius:14px;padding:12px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.04);list-style:none;transition:border-color .2s,box-shadow .2s}
  .node:hover{border-color:#f0b4b6;box-shadow:0 6px 18px rgba(229,72,77,.08)}
  .node .bullet{background:#e5484d;box-shadow:0 1px 3px rgba(229,72,77,.3)}
  .node .bullet .bullet-dot{background:#fff}
  .node.collapsed > .bullet{background-color:#dee0e3}
  .node.collapsed > .bullet .bullet-dot{background-color:rgb(100,106,115)}
  .node .content{font-size:14px;font-weight:600;line-height:1.5;word-break:break-word}
  .node .note{font-size:12px;color:#666;line-height:1.6;margin-top:4px;word-break:break-word;white-space:pre-wrap}
  .title{font-size:20px;font-weight:700;word-break:break-word;padding-bottom:14px;margin-bottom:14px}
  body.mrhx-grid2 .node-list{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-left:0}
  body.mrhx-grid2 .node{margin-bottom:0;display:flex;flex-direction:column;padding:0;overflow:hidden;transition:border-color .25s,box-shadow .25s,transform .25s}
  body.mrhx-grid2 .node:hover{border-color:#f0b4b6;transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.08)}
  body.mrhx-grid2 .node .bullet{display:none}
  body.mrhx-grid2 .node .image-list{order:-1;margin:0;padding:0;display:block;background:#f4f2ef;overflow:hidden}
  body.mrhx-grid2 .node .image-list .image-row{margin:0;display:block}
  body.mrhx-grid2 .node .image-list .image img{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;background:#f4f2ef;border-radius:0;cursor:pointer;transition:transform .3s}
  body.mrhx-grid2 .node:hover .image-list .image img{transform:scale(1.04)}
  body.mrhx-grid2 .node .content{order:1;margin:12px 14px 0;font-size:14px;font-weight:700;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  body.mrhx-grid2 .node .note{order:2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:7px 14px 0;font-size:12px;color:#888;line-height:1.65}
  body.mrhx-grid2 .node.exp .note{display:block;-webkit-line-clamp:unset;-webkit-box-orient:vertical;max-height:none;overflow:visible}
  body.mrhx-grid2 .node .mrhx-dl{order:3;margin:8px 14px 12px}
  body.mrhx-grid2 .node .img-tip{order:4;display:block;margin:0 14px 12px;font-size:11px;color:#aaa;text-align:center}
  body.mrhx-grid2 .node.exp .img-tip{display:none}
  body.mrhx-grid2 .node .exp-hint{order:5;display:none;margin:0 14px 12px;padding:4px 12px;border-radius:99px;border:1px solid #e5e6e8;color:#666;font-size:11px;font-weight:600;width:max-content;max-width:calc(100% - 28px);cursor:pointer}
  body.mrhx-grid2 .node .exp-hint:hover{border-color:#e5484d;color:#e5484d}
  body.mrhx-grid2 .node-full{grid-column:1/-1;display:flex;flex-direction:column}
  body.mrhx-grid2 .node-full .content{-webkit-line-clamp:unset;overflow:visible}
  body.mrhx-grid2 .node-full .note{display:block;-webkit-line-clamp:unset;-webkit-box-orient:vertical;max-height:none;overflow:visible}
  .mrhx-plat{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:600;font-style:normal;vertical-align:2px;letter-spacing:.5px;color:#fff;background:#e5484d;white-space:nowrap}
  @media (max-width:720px){
    body.narrow{padding-left:12px !important;padding-right:12px !important;padding-top:104px !important}
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
    .title{font-size:18px;line-height:28px;min-height:28px;padding-bottom:12px;margin-bottom:12px}
    .node-list{margin-left:0}
    .node{padding:12px;border-radius:12px}
    .node .bullet{display:none}
    .node .content{font-size:14px}
    .mrhx-dl .mrhx-btn{flex:1 1 45%;text-align:center}
    body.mrhx-grid2 .node-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    body.mrhx-grid2 .node{border-radius:12px}
    body.mrhx-grid2 .node .content{margin:10px 12px 0}
    body.mrhx-grid2 .node .note{margin:6px 12px 0;font-size:12px}
    body.mrhx-grid2 .node .mrhx-dl{margin:8px 12px 12px}
    body.mrhx-grid2 .node .img-tip{margin:0 12px 12px}
    body.mrhx-grid2 .node .exp-hint{margin:0 12px 12px}
    body.mrhx-grid2 .mrhx-dl .mrhx-btn{flex:1 1 45%;text-align:center}
    .image-list .image{max-width:100% !important}
  }
  .mrhx-comments{max-width:100%;margin-top:24px;padding-top:16px;border-top:2px solid #ecebe9}
  .mrhx-comments h2{font-size:17px;color:#2b2b2b;margin-bottom:12px;display:flex;align-items:baseline;gap:8px;font-weight:700}
  .mrhx-cnum{font-size:12px;color:#aaa;font-weight:400}
  .mrhx-citem{width:100%;min-width:0;background:#fff;border:1px solid #ecebe9;border-radius:10px;padding:12px 14px;margin-bottom:6px;box-shadow:0 1px 2px rgba(0,0,0,.03);transition:.2s}
  .mrhx-citem:hover{border-color:#f0b4b6;box-shadow:0 6px 18px rgba(229,72,77,.08)}
  .mrhx-creply-item{width:auto;min-width:0;max-width:100%;border:1px solid #ecebe9;border-left:3px solid #f0b4b6;border-radius:10px;background:#fdf9f7;box-shadow:0 1px 2px rgba(0,0,0,.02);padding:10px 12px;margin-top:6px}
  .mrhx-creply-item:hover{border-color:#f0b4b6;box-shadow:0 4px 12px rgba(229,72,77,.06)}
  .mrhx-thread{margin-top:4px;padding-left:0;overflow:hidden}
  .mrhx-chead{display:flex;align-items:center;gap:6px;margin-bottom:3px;min-width:0}
  .mrhx-cav{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#fbc4c7,#e5484d);color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .mrhx-cmeta{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;min-width:0}
  .mrhx-cmeta b{font-size:12px;color:#2b2b2b;font-weight:600}
  .mrhx-replyto{font-size:10px;color:#e58d0a;font-weight:500;white-space:nowrap}
  .mrhx-cmeta .mrhx-ctime{font-size:10px;color:#b8b2aa}
  .mrhx-ccontent{font-size:12px;color:#444;line-height:1.6;white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;padding-left:28px;margin-top:0}
  .mrhx-cbar{margin-top:4px;padding-left:28px;display:flex;gap:4px}
  .mrhx-cbtn{border:1px solid #ecebe9;background:#faf9f7;color:#888;font-size:11px;cursor:pointer;padding:3px 10px;border-radius:99px;transition:.2s}
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
  .mrhx-cform{margin-top:14px;background:#fff;border:1px solid #ecebe9;border-radius:13px;padding:14px;box-shadow:0 2px 8px rgba(0,0,0,.04)}
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
  .mrhx-cfold-wrap{position:relative}
  .mrhx-cfold-wrap.mrhx-cfolded{max-height:280px;overflow:hidden}
  .mrhx-cfold-mask{position:absolute;left:0;right:0;bottom:0;height:150px;background:linear-gradient(to bottom,rgba(255,255,255,0),#fff 70%);display:flex;align-items:flex-end;justify-content:center;padding-bottom:18px}
  .mrhx-cfold-mask:not(.mrhx-cfold-show){display:none}
  .mrhx-cfbtn{display:inline-block;border:1px solid #f0b4b6;background:#fff;color:#e5484d;padding:8px 24px;border-radius:99px;font-size:13px;font-weight:600;cursor:pointer;transition:.2s;box-shadow:0 4px 14px rgba(229,72,77,.12)}
  .mrhx-cfbtn:hover{background:#fdf3f3;border-color:#e5484d;transform:translateY(-1px)}
  .mrhx-cinline-form{margin-top:8px;padding:12px;background:#faf9f7;border:1px solid #ecebe9;border-radius:10px;animation:mrhxFade .2s ease both}
  .mrhx-cinline-form textarea{width:100%;border:1px solid #e2e0dc;border-radius:8px;padding:10px 12px;font-size:13px;font-family:inherit;background:#fff;min-height:60px;resize:vertical;box-sizing:border-box;transition:.2s;margin-bottom:8px}
  .mrhx-cinline-form textarea:focus{outline:none;border-color:#e5484d;box-shadow:0 0 0 3px rgba(229,72,77,.08)}
  .mrhx-cinline-form .mrhx-cinline-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
  .mrhx-cinline-form .mrhx-cinline-row input{flex:1;min-width:80px;border:1px solid #e2e0dc;border-radius:8px;padding:8px 10px;font-size:12px;font-family:inherit;background:#fff}
  .mrhx-cinline-form .mrhx-cinline-row input:focus{outline:none;border-color:#e5484d}
  .mrhx-cinline-form .mrhx-cinline-send{border:none;background:#e5484d;color:#fff;padding:8px 18px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;transition:.2s;white-space:nowrap}
  .mrhx-cinline-form .mrhx-cinline-send:hover{background:#c93a3f}
  .mrhx-cinline-form .mrhx-cinline-send:disabled{opacity:.5;cursor:not-allowed}
  .mrhx-cinline-form .mrhx-cinline-cancel{border:1px solid #ecebe9;background:#fff;color:#888;padding:8px 14px;border-radius:8px;font-size:12px;cursor:pointer;transition:.2s;white-space:nowrap}
  .mrhx-cinline-form .mrhx-cinline-cancel:hover{color:#e5484d;border-color:#f0b4b6}
  .mrhx-cinline-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
  .mrhx-cinline-to{font-size:12px;color:#e58d0a;font-weight:600}
  .mrhx-cinline-to::before{content:'↩ '}
  .mrhx-cinline-x{border:none;background:none;color:#999;font-size:12px;cursor:pointer;padding:2px 8px;border-radius:99px}
  .mrhx-cinline-x:hover{color:#e5484d;background:#fdf3f3}
  .mrhx-cfbar{text-align:center;margin-top:6px}
  @media (max-width:720px){.mrhx-crow{flex-direction:column;margin-bottom:6px}.mrhx-creply-item{padding:8px 10px;margin-top:3px}.mrhx-cav{width:20px;height:20px;font-size:10px}.mrhx-ccontent{padding-left:0;overflow-wrap:anywhere;word-break:break-word}.mrhx-cbar{padding-left:0}}
  .mrhx-top{position:fixed;right:20px;bottom:24px;z-index:9999;width:44px;height:44px;border-radius:50%;background:#e5484d;color:#fff;font-size:20px;border:none;cursor:pointer;box-shadow:0 6px 18px rgba(229,72,77,.4);opacity:0;pointer-events:none;transition:.3s;line-height:1}
  .mrhx-top.show{opacity:1;pointer-events:auto}
  .mrhx-top:hover{transform:translateY(-3px);background:#c93a3f}
  @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important}}
  :focus-visible{outline:2px solid #e5484d;outline-offset:2px;border-radius:4px}
  .mrhx-popup[role='dialog']:focus-visible{outline:2px solid #e5484d;outline-offset:2px}
</style>`;

const topButton = `<button type="button" class="mrhx-top" id="mrhxTopBtn" title="滚动到底部">↓</button>
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
  const title = (ann && ann.title) ? ann.title : '公告';
  if (ann && ann.enabled === false) return '';
  return `<div class="mrhx-popup" id="mrhxPopup" role="dialog" aria-modal="true" aria-labelledby="mrhxPopupTitle">
  <div class="mrhx-popup-inner">
    <button type="button" class="mrhx-popup-close" id="mrhxPopupClose" aria-label="关闭公告">×</button>
    <div class="mrhx-popup-content">
      <h3 id="mrhxPopupTitle">${title}</h3>
      ${lines.map(l => `<p>${l}</p>`).join('\n      ')}
    </div>
    <button type="button" class="mrhx-popup-btn" id="mrhxPopupOk">我知道了</button>
  </div>
</div>
<script>
(function(){
  var k='mrhx_ann_dismissed';
  var v=localStorage.getItem(k);
  if(v){var t=parseInt(v,10);if(Date.now()-t<10800000){var el=document.getElementById('mrhxPopup');if(el)el.style.display='none';return;}}
  var close=function(){localStorage.setItem(k,String(Date.now()));var el=document.getElementById('mrhxPopup');if(el)el.style.display='none';};
  var c=document.getElementById('mrhxPopupClose');if(c)c.onclick=close;
  var b=document.getElementById('mrhxPopupOk');if(b)b.onclick=close;
})();
</script>
<style>
.mrhx-popup{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;animation:mrhxPopFade .3s ease both}
.mrhx-popup-inner{background:#fff;border-radius:16px;padding:24px 22px 18px;max-width:520px;width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative;text-align:center;animation:mrhxPopSlide .3s ease both}
.mrhx-popup-close{position:absolute;top:10px;right:12px;width:30px;height:30px;border:none;border-radius:50%;background:#faf9f7;color:#666;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.mrhx-popup-close:hover{background:#fdf1f1;color:#e5484d}
.mrhx-popup-content h3{font-size:16px;color:#2b2b2b;margin-bottom:10px}
.mrhx-popup-content p{font-size:13px;color:#666;line-height:1.4;margin-bottom:0;white-space:pre-wrap}
.mrhx-popup-btn{margin-top:12px;padding:8px 24px;border:none;border-radius:10px;background:#e5484d;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:.2s}
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

const dlTrackScript = (sb, key, postUrl) => `<script>
(function(){
  var SB='${sb}',K='${key}',POST='${postUrl}';
  var h={'apikey':K,'Authorization':'Bearer '+K,'Content-Type':'application/json'};
  document.addEventListener('click',function(e){
    var a=e.target.closest('a.mrhx-btn-m,a.mrhx-btn-b,a.mrhx-btn-qk');
    if(!a)return;
    try{
      var game=a.closest('.node');
      var name=game?game.querySelector('.content.mm-editor span'):null;
      fetch(SB+'/rest/v1/download_clicks',{method:'POST',headers:h,body:JSON.stringify({post_url:POST,game_name:name?name.textContent.trim():'',link_url:a.href,link_type:a.classList.contains('mrhx-btn-m')?'mobile':a.classList.contains('mrhx-btn-b')?'baidu':'custom'})}).then(function(r){if(!r.ok)console.error('[dl-track] HTTP',r.status)}).catch(function(x){console.error('[dl-track]',x)});
    }catch(x){console.error('[dl-track]',x)}
  });
})();
</script>`;

const staggered = Array.from({ length: 20 }, (_, i) => `.node:nth-child(${i + 1}){animation-delay:${Math.round(i * 50) / 1000}s}`).join('\n');

function dayTag(file) {
  const name = path.parse(file).name;
  const m = name.match(/(\d+)月(\d+)/);
  if (m) return `${m[1]}月${m[2]}`;
  // Handle M.D.D format (e.g., 8.1.1 → look up existing asset dir or use 8.11)
  const dot3 = name.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (dot3) {
    const base = `${dot3[1]}.${parseInt(dot3[2] + dot3[3])}`;
    // Prefer longer (more specific) match first, e.g. 8.11pcaz over 8.11
    try {
      const dirs = fs.readdirSync('assets').filter(d => fs.statSync(path.join('assets', d)).isDirectory());
      const longer = dirs.filter(d => d.startsWith(base) && d !== base).sort((a, b) => b.length - a.length);
      if (longer.length) return longer[0];
    } catch (e) {}
    // Fall back to exact base match
    if (fs.existsSync(path.join('assets', base))) return base;
    return base;
  }
  return name;
}

function iconTitle(d) {
  const cut = d.split(/[（(]/)[0].trim();
  return cut || d;
}

async function localize(html, tag) {
  // 先把所有旧 CDN URL 替换成 @main，不需要重新下载
  html = html.replace(/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^/"]+/g, `cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main`);
  // 移除幕布导出的内嵌字体（@font-face base64）
  html = html.replace(/@font-face\s*\{[^}]*font-family\s*:\s*['"]?mm-iconfont['"]?;[^}]*\}/g, '');
  html = html.replace(/\.mm-iconfont::before\s*\{[^}]*\}/g, '');
  // 修复 viewport maximum-scale=1 阻止缩放
  html = html.replace(/<meta[^>]*name=['"]viewport['"][^>]*>/gi, '<meta name="viewport" content="width=device-width, initial-scale=1">');
  // 剥离卡片封面的内联固定宽度，交给 CSS 自适应（否则窄卡会横向溢出）
  html = html.replace(/<img\b([^>]*class="image"[^>]*)>/gi, (m, attrs) => {
    const cleaned = attrs.replace(/\sstyle="([^"]*)"/i, (s, inner) => {
      const rest = inner.replace(/width\s*:\s*[\d.]+(?:px)?\s*;?/gi, '').trim();
      return rest ? ` style="${rest}"` : '';
    });
    return '<img' + cleaned + '>';
  });

  const urls = [...new Set([...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map(m => m[1]))]
    .filter(url => !url.includes(CDN_URL));
  if (urls.length) {
    const dir = path.join('assets', tag);
    fs.mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const url of urls) {
      const name = `img_${String(++n).padStart(2, '0')}.webp`;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = Buffer.from(await res.arrayBuffer());
          const compressed = await sharp(buf)
            .webp({ quality: 80, alphaQuality: 100, lossless: false })
            .toBuffer();
          fs.writeFileSync(path.join(dir, name), compressed);
          html = html.split(url).join(`${CDN_URL}/assets/${tag}/${name}`);
          console.log('  img', tag, name, `(${(buf.length/1024).toFixed(0)}KB -> ${(compressed.length/1024).toFixed(0)}KB)`);
          break;
        } catch (e) {
          if (attempt === 3) console.warn('  下载失败(保留原链接):', url, e.message);
          else await new Promise(r => setTimeout(r, 1500 * attempt));
        }
      }
    }
  }
  html = html.replace(/assets\/[^"\/]+(?=\/)/g, 'assets/' + tag);
  html = html.replace(/src="assets\//g, `src="${CDN_URL}/assets/`);
  return html.split('crossorigin="anonymous"').join('');
}

function extractLinks(noteHtml) {
  const links = [];
  const re = /<a class="([^"]*)"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(noteHtml)) !== null) {
    if (!/content-link|mrhx-btn/.test(m[1])) continue;
    const label = m[3].replace(/<[^>]+>/g, '').replace(/[：:]\s*$/, '').trim();
    links.push({ url: m[2], label });
  }
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
    const cls = 'mrhx-btn ' + (matched ? matched.cls : 'mrhx-btn-qk');
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
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh;padding-top:115px}
header{position:fixed;top:0;left:0;right:0;z-index:100;background:#fff;border-bottom:1px solid #ecebe9;box-shadow:0 1px 6px rgba(0,0,0,.04)}
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
  @media (max-width:720px){body{padding-top:105px}.hwrap{padding:12px 14px}nav{gap:6px}nav a{padding:5px 10px;font-size:12px}.site img.site-logo{width:90px;height:auto}.mrhx-search input{width:90px}}
</style>
<link rel="icon" href="${CDN_URL}/favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="${CDN_URL}/favicon.webp">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="${CDN_URL}/logo.webp" alt="Tsinho黄油推荐站" class="site-logo"></a>
    <div class="site-header-right">
      <form class="mrhx-search" action="search.html" method="get" role="search">
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
    // skip qzt.html and jinri.html from normal day-page checks (different structure)
    const isQzt = d.file === 'qzt.html';
    const isJinri = d.file === 'jinri.html';
    const ref = `href="${esc(path.basename(d.file))}"`;
    if (!index.includes(ref)) errors.push(`首页缺少帖子链接: ${d.file}`);
    const h = fs.readFileSync(d.file, 'utf8');
    if ((isQzt || isJinri) ? false : !h.includes('<li class="node"') && !h.includes('暂无')) errors.push(`帖子正文缺失节点: ${d.file}`);
    if (Number(d.gameCount) > 0 && !index.includes(`共 ${d.gameCount} 款游戏`)) errors.push(`首页游戏数与实际不符: ${d.file} (${d.gameCount})`);
    const disp = TITLES[path.parse(d.file).name] || path.parse(d.file).name;
    const titleOk = h.includes(`<title>${esc(disp)} · ${esc(SITE_NAME)}</title>`);
    const h1Ok = h.includes(`>${esc(disp)}</div>`);
    if (!titleOk && !h1Ok) errors.push(`帖子标题未同步: ${d.file} (期望 ${disp})`);
    if ((isQzt || isJinri) ? false : SITE.comments.enabled && !h.includes('<!--mrhx-comments-->')) errors.push(`评论区注入缺失: ${d.file}`);
    if ((isQzt || isJinri) ? false : SITE.comments.enabled && !h.includes('inc_page_view')) errors.push(`浏览量脚本注入缺失: ${d.file}`);
    [...h.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].forEach(m => {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (/(?:PC\s*\+\s*安卓|PC|安卓){2,}/.test(t)) errors.push(`标题含重复平台标记: ${d.file} → ${t}`);
    });
    [...h.matchAll(/(?:href|src)="([^"]+)"/g)].forEach(m => {
      const u = m[1];
      if (/javascript:/i.test(u) || /[\s"'<>]/.test(u)) errors.push(`非法链接格式: ${d.file} → ${u}`);
    });
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


// compress all existing images in assets/ to webp (quality 80)
async function compressExistingAssets() {
  const assetsDir = 'assets';
  if (!fs.existsSync(assetsDir)) return;
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(assetsDir, entry.name);
    const files = fs.readdirSync(subDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext)) continue;
      const srcPath = path.join(subDir, file);
      const dstPath = path.join(subDir, path.parse(file).name + '.webp');
      if (fs.existsSync(dstPath) && fs.statSync(dstPath).mtime >= fs.statSync(srcPath).mtime) continue;
      try {
        const buf = fs.readFileSync(srcPath);
        const compressed = await sharp(buf)
          .webp({ quality: 80, alphaQuality: 100, lossless: false })
          .toBuffer();
        fs.writeFileSync(dstPath, compressed);
        console.log('  compress', entry.name, file, `-> ${path.parse(file).name}.webp (${(buf.length/1024).toFixed(0)}KB -> ${(compressed.length/1024).toFixed(0)}KB)`);
      } catch (e) {
        console.warn('  compress failed:', srcPath, e.message);
      }
    }
  }
}

const days = [];
const searchIndex = [];
const allGames = [];
(async () => {
    await compressExistingAssets();

for (const file of files) {
    let html = fs.readFileSync(POST_DIR + '/' + file, 'utf8');
    const computed = (html.match(/<li class="node[^"]*heading/g) || []).length;
    const tag = dayTag(file);
    const gameCount = overrides[tag] !== undefined ? overrides[tag] : computed;

    html = await localize(html, tag);

    // update local asset refs to .webp if exists
    const tagDir = path.join('assets', tag);
    if (fs.existsSync(tagDir)) {
      const assetFiles = fs.readdirSync(tagDir);
      const webpFiles = new Set(assetFiles.filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', '')));
      for (const base of webpFiles) {
        // replace .png, .jpg, .jpeg, .gif references with .webp
        const extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'];
        for (const ext of extensions) {
          const oldRef = `assets/${tag}/${base}${ext}`;
          const newRef = `assets/${tag}/${base}.webp`;
          if (html.includes(oldRef)) {
            html = html.split(oldRef).join(newRef);
          }
        }
      }
    }


    const iconRe = /(?:<link rel="icon"[^>]*>\s*<link rel="apple-touch-icon"[^>]*>\s*)+/g;
    html = html.replace(iconRe, (m) => {
      const first = m.match(/<link rel="icon"[^>]*>/);
      const second = m.match(/<link rel="apple-touch-icon"[^>]*>/);
      return first && second ? `${first[0]}\n${second[0]}\n` : m;
    });
    const viewRe = /(<script>\s*\(function \(\) \{\s*try \{[\s\S]*?inc_page_view[\s\S]*?<\/script>\s*)(?=[\s\S]*?inc_page_view)/g;
    html = html.replace(viewRe, '');

    html = html.replace(/\n\s*<li class="node">[\s\S]*?<\/li>/g, '');

    html = html.replace(/<div class="note mm-editor">([\s\S]*?)<\/div>/g,
      (m, inner) => {
        if (/<a class="mrhx-btn mrhx-btn-[a-z-]+"/.test(inner)) return m;
        if (/content-link/.test(inner) || inner.includes('mrhx-dl')) return '<div class="note mm-editor">' + rebuildNote(inner) + '</div>';
        return m;
      });

    html = html.replace(/<a class="mrhx-btn-([a-z-]+)"/g, '<a class="mrhx-btn mrhx-btn-$1"');

    const pageFallbackPlat = /pcaz|安卓/i.test(tag) ? 'PC+安卓' : (/pc$/i.test(tag) ? 'PC' : '');

html = (function reorderNodes(str) {
    var start = str.indexOf('<ul class="node-list">');
    if (start < 0) return str;
    var end = str.lastIndexOf('</ul>');
    if (end < start) return str;
    var prefix = str.slice(0, start);
    var inner = str.slice(start + 21, end).replace(/^[ \t]*>[ \t]*\r?\n/gm, '');
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
      block = block.replace(/^[ \t]*>[ \t]*\r?\n/gm, '');
      var dlm = block.match(/<div class="mrhx-dl">[\s\S]*?<\/div>/);
      var dlBlock = dlm ? dlm[0] : '';
      var clean = dlBlock ? block.replace(dlBlock, '') : block;
      var content = clean.match(/<div class="content mm-editor" ><span>[\s\S]*?<\/span><\/div>/);
      var note = clean.match(/<div class="note mm-editor">[\s\S]*?<\/div>/);
      var img = clean.match(/<ul class="image-list">[\s\S]*?<\/ul>/);
      if (!note && !img) return block;
      var noteBlock = note ? note[0] : '';
      var imgBlock = img ? img[0] : '';
      var contentBlock = content ? content[0] : '';
      var plat = '';
      var platSource = noteBlock + (contentBlock || '');
      if (/PC\s*\+\s*安卓/.test(platSource) || /安卓/.test(platSource)) plat = 'PC+安卓';
      else if (/PC/.test(platSource)) plat = 'PC';
      if (!plat && pageFallbackPlat) plat = pageFallbackPlat;
      if (plat && contentBlock) {
        contentBlock = contentBlock
          .replace(/<em class="mrhx-plat">[^<]*<\/em>/g, '')
          .replace(/(?:PC\s*\+\s*安卓|PC|安卓){2,}/g, '')
          // 剥离游戏名文本末尾紧挨着的平台文字（可能带方括号/空格），避免与后加的标签重复
          .replace(/[\s\[［]*(?:PC\s*[\+＋]\s*安卓|PC\s*安卓|安卓|PC)[\s\]］]*(?=<\/span><\/div>)/g, '')
          .replace(/<\/span><\/div>/, `<em class="mrhx-plat">${plat}</em></span></div>`);
      }
      var openTag = clean.match(/<li class="node heading3">[\s\S]*?<\/div>[\s\S]*?<\/div>/);
      var open = openTag ? openTag[0].replace(/\s+$/, '') + '\n  ' : '<li class="node heading3">\n  ';
      if (contentBlock && contentBlock.indexOf('免费帮找') > -1) {
        open = open.replace(/<li class="node heading3">/, '<li class="node heading3 node-full">');
      }
      return open + contentBlock + (imgBlock ? '\n    ' + imgBlock : '') + (dlBlock ? '\n    ' + dlBlock : '') + (noteBlock ? '\n    ' + noteBlock : '') + '\n  </li>';
    });
    blocks = blocks.filter(b => b.trim().length > 0);
    return prefix + '<ul class="node-list">\n' + blocks.join('') + '\n  </ul>' + suffix;
  })(html);

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
  <a class="mlogo" href="index.html"><img src="${CDN_URL}/logo.webp" alt="Tsinho黄油推荐站" class="mlogo-img"></a>
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
    // Add lang="zh-CN" to <html> if missing
    html = html.replace(/<html(?![^>]*\slang)/i, '<html lang="zh-CN"');
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
    const gridCls = GRID2_POSTS.has(shortName) ? ' mrhx-grid2' : '';
    html = html.replace(/<body([^>]*)>/, (m, a) => a.includes('class') ? m.replace(/class="([^"]*)"/, (_, c) => `class="${c.replace(/\s*mrhx-grid2/g, '')}${gridCls}"`) : `<body class="narrow${gridCls}">`);
    const dispTitle = TITLES[shortName] || shortName;
    html = html.replace(/<div class="title">[\s\S]*?<\/div>/, `<div class="title">${esc(dispTitle)}</div>`);
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(dispTitle)} · ${esc(SITE_NAME)}</title>`);
    html = html.replace('</head>', (html.includes('rel="icon" href="' + CDN_URL + '/favicon.webp"')) ? '</head>' : `<link rel="icon" href="${CDN_URL}/favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="${CDN_URL}/favicon.webp">
</head>`);
    html = html.replace(/<!--mrhx-seo-->[\s\S]*?<!--\/mrhx-seo-->/g, '');
    html = html.replace('</head>', `<!--mrhx-seo-->${seoHead(shortName + '.html', dispTitle)}<!--/mrhx-seo-->\n</head>`);

    const v = SITE.comments;
    let commentBlock = '';
    if (v.enabled && v.url && v.anonKey) {
      const sb = esc(v.url.replace(/\/+$/, ''));
      const key = esc(v.anonKey);
      commentBlock = `<!--mrhx-comments-->
<div class="mrhx-comments" id="mrhx-comments">
  <h2>评论区<span class="mrhx-cnum" id="mrhx-cnum"></span></h2>
  <div class="mrhx-cfbar" id="mrhx-cfbar" style="display:none"><button type="button" class="mrhx-cfbtn" id="mrhx-cfbar-btn">缩短评论</button></div>
  <div class="mrhx-cfold-wrap" id="mrhx-cfold-wrap">
    <div id="mrhx-clist"></div>
    <div class="mrhx-cfold-mask" id="mrhx-cfold-mask"><button type="button" class="mrhx-cfbtn" id="mrhx-cfold-btn">展开评论</button></div>
  </div>
  <form id="mrhx-cform" class="mrhx-cform">
    <div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true">
      <label>请不要填写此栏<input type="text" id="mrhx-hp" name="website" tabindex="-1" autocomplete="off"></label>
    </div>
    <div class="mrhx-cform-title">💬 发表评论</div>
    <div class="mrhx-crow">
      <input type="text" id="mrhx-nick" placeholder="昵称" maxlength="30" required>
      <input type="email" id="mrhx-mail" placeholder="常用邮箱（站长回复会发到这里）" required>
    </div>
    <textarea id="mrhx-ctext" placeholder="友善评论，请支持正版…" maxlength="2000" required></textarea>
    <div class="mrhx-crow mrhx-csub">
      <span id="mrhx-creply" class="mrhx-creply"></span>
      <button type="submit">发表评论</button>
    </div>
  </form>
</div>
<div class="mrhx-cpop" id="mrhx-cpop" role="dialog" aria-modal="true" aria-labelledby="mrhx-cpop-title">
  <div class="mrhx-cpop-box">
    <h3 id="mrhx-cpop-title">邮箱填写提示</h3>
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
  var foldWrap = document.getElementById('mrhx-cfold-wrap');
  var foldMask = document.getElementById('mrhx-cfold-mask');
  var foldBtn = document.getElementById('mrhx-cfold-btn');
  var cfbar = document.getElementById('mrhx-cfbar');
  var cfbarBtn = document.getElementById('mrhx-cfbar-btn');
  var folded = true;
  function applyFold() {
    if (!foldWrap) return;
    var need = all.length > 6;
    if (!need) {
      foldWrap.classList.remove('mrhx-cfolded');
      foldMask.classList.remove('mrhx-cfold-show');
      if (cfbar) cfbar.style.display = 'none';
      return;
    }
    if (folded) {
      foldWrap.classList.add('mrhx-cfolded');
      foldMask.classList.add('mrhx-cfold-show');
      foldBtn.textContent = '展开评论（' + all.length + ' 条）';
      if (cfbar) cfbar.style.display = 'none';
    } else {
      foldWrap.classList.remove('mrhx-cfolded');
      foldMask.classList.remove('mrhx-cfold-show');
      if (cfbar) cfbar.style.display = 'block';
    }
  }
  if (foldBtn) foldBtn.onclick = function () { folded = false; applyFold(); };
  if (cfbarBtn) cfbarBtn.onclick = function () { folded = true; applyFold(); };
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
    function buildRow(c) {
      var row = h('div', 'mrhx-citem' + (c.is_admin ? ' mrhx-citem-admin' : '') + (c.pid ? ' mrhx-creply-item' : ''));
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
      row.appendChild(h('div', 'mrhx-ccontent', c.content));      var bar = h('div', 'mrhx-cbar');
      if (!c.pinned) {
      var rp = h('button', 'mrhx-cbtn', '回复');
      rp.type = 'button';
      rp.onclick = function () {
        var existForm = row.querySelector('.mrhx-cinline-form');
        if (existForm) { existForm.remove(); return; }
        document.querySelectorAll('.mrhx-cinline-form').forEach(function(f) { f.remove(); });
        var iform = document.createElement('div');
        iform.className = 'mrhx-cinline-form';
        var ihead = document.createElement('div');
        ihead.className = 'mrhx-cinline-head';
        ihead.appendChild(h('span', 'mrhx-cinline-to', '回复 @' + (c.nick || '匿名')));
        var xBtn = document.createElement('button');
        xBtn.type = 'button'; xBtn.className = 'mrhx-cinline-x'; xBtn.textContent = '取消';
        ihead.appendChild(xBtn);
        iform.appendChild(ihead);
        var ta = document.createElement('textarea');
        ta.placeholder = '回复 @' + (c.nick || '匿名') + '…';
        ta.maxLength = 2000;
        iform.appendChild(ta);
        var frow = document.createElement('div');
        frow.className = 'mrhx-cinline-row';
        var inick = document.createElement('input');
        inick.type = 'text'; inick.placeholder = '昵称'; inick.maxLength = 30;
        inick.value = localStorage.getItem('mrhx_nick') || '';
        var imail = document.createElement('input');
        imail.type = 'email'; imail.placeholder = '邮箱'; imail.value = localStorage.getItem('mrhx_mail') || '';
        var sendBtn = document.createElement('button');
        sendBtn.type = 'button'; sendBtn.className = 'mrhx-cinline-send'; sendBtn.textContent = '发送';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button'; cancelBtn.className = 'mrhx-cinline-cancel'; cancelBtn.textContent = '取消';
        frow.appendChild(inick); frow.appendChild(imail); frow.appendChild(sendBtn); frow.appendChild(cancelBtn);
        iform.appendChild(frow);
        bar.parentNode.insertBefore(iform, bar.nextSibling);
        ta.focus();
        imail.addEventListener('focus', function () { if (!popShown) { popShown = true; if (pop) pop.classList.add('show'); } });
        xBtn.onclick = function () { iform.remove(); };
        cancelBtn.onclick = function () { iform.remove(); };
        sendBtn.onclick = function () {
          var nick = inick.value.trim(), mail = imail.value.trim(), content = ta.value.trim();
          if (!nick || !mail || !content) { alert('请填写昵称、邮箱和内容'); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { alert('邮箱格式不正确'); return; }
          sendBtn.disabled = true; sendBtn.textContent = '发送中…';
          fetch(SB + '/rest/v1/rpc/guard_comment', {
            method: 'POST',
            headers: Object.assign(headers(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
            body: JSON.stringify({ p_url: PATH, p_nick: nick, p_email: mail, p_content: content, p_pid: c.id })
          }).then(function (r) {
            if (r.status === 404) throw new Error('评论防护服务尚未部署，请联系站长');
            if (!r.ok) return r.json().then(function (d) { throw new Error((d && (d.message || d.details)) || 'HTTP ' + r.status); });
            return r.json();
          }).then(function (d) {
            if (d && d.ok === false) throw new Error(d.error || '评论未通过检查');
            localStorage.setItem('mrhx_nick', nick);
            localStorage.setItem('mrhx_mail', mail);
            load();
          }).catch(function (e) { alert('发送失败：' + e.message); }).finally(function () { sendBtn.disabled = false; sendBtn.textContent = '发送'; });
        };
      };
      bar.appendChild(rp);
      }
      if (ADMIN) {
        var eb = h('button', 'mrhx-cbtn', '编辑');
        eb.type = 'button';
        eb.onclick = function () {
          var box = row.querySelector('.mrhx-cedit');
          if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; return; }
          var wrap = document.createElement('div');
          wrap.className = 'mrhx-cedit';
          wrap.style.cssText = 'margin-top:8px;padding:8px;background:#faf9f7;border-radius:8px;border:1px solid #e8e8e8';
          var ta = document.createElement('textarea');
          ta.value = c.content;
          ta.style.cssText = 'width:100%;min-height:50px;border:1px solid #ddd;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;resize:vertical';
          var saveBtn = h('button', 'mrhx-cbtn', '保存');
          saveBtn.type = 'button';
          saveBtn.style.cssText = 'margin-top:6px;margin-right:6px;background:#e5484d;color:#fff;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px';
          saveBtn.onclick = function () {
            var val = ta.value.trim();
            if (!val) { alert('内容不能为空'); return; }
            saveBtn.disabled = true; saveBtn.textContent = '保存中…';
            fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign(headers(), { 'x-admin-key': ADMIN, 'Prefer': 'return=minimal' }), body: JSON.stringify({ content: val }) })
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
              .catch(function (e) { alert('编辑失败：' + e.message); saveBtn.disabled = false; saveBtn.textContent = '保存'; });
          };
          var cancelBtn = h('button', 'mrhx-cbtn', '取消');
          cancelBtn.type = 'button';
          cancelBtn.style.cssText = 'margin-top:6px;background:#f0f0f0;color:#666;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px';
          cancelBtn.onclick = function () { wrap.style.display = 'none'; };
          wrap.appendChild(ta);
          wrap.appendChild(saveBtn);
          wrap.appendChild(cancelBtn);
          row.appendChild(wrap);
        };
        bar.appendChild(eb);
        var dl = h('button', 'mrhx-cbtn mrhx-cdel', '删除');
        dl.type = 'button';
        dl.onclick = function () {
          if (!confirm('删除这条评论及其回复？')) return;
          fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'DELETE', headers: Object.assign(headers(), { 'x-admin-key': ADMIN }) })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
            .catch(function (e) { alert('删除失败：' + e.message); });
        };
        bar.appendChild(dl);
        if (!c.pid) {
          var pin = h('button', 'mrhx-cbtn', c.pinned ? '取消置顶' : '置顶');
          pin.type = 'button';
          pin.onclick = function () {
            fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign(headers(), { 'x-admin-key': ADMIN, 'Prefer': 'return=minimal' }), body: JSON.stringify({ pinned: !c.pinned }) })
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
              .catch(function (e) { alert('置顶失败：' + e.message + '\\n请先在 Supabase 运行 README 中的升级 SQL（comments 表添加 pinned 字段）。'); });
          };
          bar.appendChild(pin);
        }
      }
      row.appendChild(bar);
      return row;
    }
    function flatRender() {
      var depthMap = {};
      function getDepth(c) {
        if (depthMap[c.id] !== undefined) return depthMap[c.id];
        if (!c.pid) { depthMap[c.id] = 0; return 0; }
        var parent = all.filter(function(p) { return p.id === c.pid; })[0];
        depthMap[c.id] = parent ? getDepth(parent) + 1 : 0;
        return depthMap[c.id];
      }
      all.forEach(function(c) { getDepth(c); });
      function latestActivity(c) {
        var latest = c.created_at;
        all.forEach(function(r) { if (r.pid === c.id && r.created_at > latest) latest = r.created_at; });
        return latest;
      }
      var topLevel = all.filter(function(c) { return !c.pid; })
        .sort(function(a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || latestActivity(b).localeCompare(latestActivity(a)); });
      function renderChildren(parentId) {
        all.filter(function(r) { return r.pid === parentId; })
          .sort(function(a, b) { return b.created_at.localeCompare(a.created_at); })
          .forEach(function(r) {
            var d = depthMap[r.id] || 1;
            var row = buildRow(r);
            row.style.marginLeft = d > 0 ? '20px' : '';
            list.appendChild(row);
            renderChildren(r.id);
          });
      }
      topLevel.forEach(function(c) {
        list.appendChild(buildRow(c));
        renderChildren(c.id);
      });
    }
    flatRender();
    if (!all.length) list.appendChild(h('p', 'mrhx-cempty', '还没有评论，来说两句吧'));
    applyFold();
  }
  function load() {
    list.innerHTML = '<p class="mrhx-loading">评论加载中...</p>';
    fetch(SB + '/rest/v1/comments?url=eq.' + encodeURIComponent(PATH) + '&select=id,pid,nick,is_admin,pinned,content,created_at&order=created_at.desc', { headers: headers() })
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
      body: JSON.stringify({ p_url: PATH, p_nick: nick, p_email: mail, p_content: content, p_pid: null })
    }).then(function (r) {
      if (r.status === 404) throw new Error('评论防护服务尚未部署，请联系站长');
      if (!r.ok) return r.json().then(function (d) { throw new Error((d && (d.message || d.details)) || 'HTTP ' + r.status); });
      return r.json();
    }).then(function (d) {
      if (d && d.ok === false) throw new Error(d.error || '评论未通过检查');
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
    html = html.replace(/<button[^>]*class="mrhx-top"[^>]*>[\s\S]*?<\/script>\s*/g, '');
    html = html.replace(/<script>\s*\(function \(\) \{\s*try \{\s*var day = new Date\(\)[\s\S]*?inc_page_view[\s\S]*?<\/script>\s*/g, '');
    const topBtn = topButton;
    const vb = (v.enabled && v.url && v.anonKey) ? viewScript(v.url.replace(/\/+$/, ''), v.anonKey, '/' + shortName + '.html') : '';
    const staggerBlock = html.includes('<!--mrhx-stagger-->') ? '' : `\n  <!--mrhx-stagger--><style>\n${staggered}\n</style>`;
    html = html.replace(/<!--mrhx-expand-->[\s\S]*?<\/script>\s*/g, '');
    html = html.replace(/<script>\s*\(function\(\)\{[\s\S]*?download_clicks[\s\S]*?<\/script>\s*/g, '');
    const dt = (v.enabled && v.url && v.anonKey) ? dlTrackScript(v.url.replace(/\/+$/, ''), v.anonKey, '/' + shortName + '.html') : '';
    html = html.replace('</body>', `  ${topBtn}${commentBlock ? '\n  ' + commentBlock : ''}${vb ? '\n  ' + vb : ''}${dt ? '\n  ' + dt : ''}${staggerBlock}${nodeExpandScript}\n  </body>`);

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
      const title = ((b.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/) || [])[1] || '').replace(/<em class="mrhx-plat">[^<]*<\/em>/g, '').replace(/<[^>]+>/g, '').trim();
      const intro = (b.match(/<div class="note mm-editor"><span>([\s\S]*?)<\/span><\/div>/) || [])[1] || '';
      const img = (b.match(/src="([^"]+)"/) || [])[1] || '';
      const plat = (b.match(/<em class="mrhx-plat">([^<]*)<\/em>/) || [])[1] || '';
      const links = [...b.matchAll(/<a class="mrhx-btn[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m => ({ url: m[1], label: m[2].replace(/[：:]\s*$/, '') }));
      return { title, intro, img, links, plat, source: TITLES[shortName] || shortName };
    }).filter(g => g.title);
    searchIndex.push(...games);
    allGames.push(...games.map(g => ({ ...g, file })));

    fs.writeFileSync(POST_DIR + '/' + file, html);
    console.log('day page ok:', POST_DIR + '/' + file, '(' + gameCount + ' 款游戏)');
    days.push({ file: file, gameCount, tag });
    if (overrides[tag] === undefined || String(overrides[tag]) !== String(computed)) {
      overrides[tag] = computed;
      try { fs.writeFileSync('counts.json', JSON.stringify(overrides, null, 2) + '\n'); } catch (e) {}
    }
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
    const dateD3 = title.match(/^(\d+)\.(\d+)\.(\d+)/);
    const dateN = !dateD3 ? title.match(/(\d+)\.(\d+)/) : null;
    const _ic = ICONS[title];
    // 图标文字若是日期格式（如 8月20 / 8.20），则渲染成「上号下月」两行，与其他日期徽章一致
    const icM = _ic && _ic.match(/(\d+)月(\d+)/);
    const icN = _ic && _ic.match(/(\d+)\.(\d+)/);
    const badge = _ic && (icM || icN) ? `<b>${esc(icM ? icM[2] : icN[2])}</b><span>${esc(icM ? icM[1] : icN[1])}月</span>`
      : _ic ? `<b style="font-size:12px">${esc(_ic)}</b>`
      : dateM ? `<b>${dateM[2]}</b><span>${dateM[1]}月</span>`
      : dateD3 ? `<b>${parseInt(dateD3[2] + dateD3[3])}</b><span>${dateD3[1]}月</span>`
      : dateN ? `<b>${dateN[2]}</b><span>${dateN[1]}月</span>`
      : `<b style="font-size:12px">${esc(iconTitle(disp))}</b>`;
    const dayHtml = fs.readFileSync(d.file, 'utf8');
    const covers = [...new Set([...dayHtml.matchAll(/src="(https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^\/]+\/assets\/[^"]+)"/g)].map(m => m[1]))].slice(0, 5)
      .map(src => `<img src="${src}" alt="${esc(disp)}" loading="lazy">`).join('');
    const _pfile = path.basename(d.file);
    return `<a class="post" href="${_pfile}" data-path="/${_pfile}" style="animation-delay:${di * 0.1}s">
  <div class="date">${badge}</div>
  <div class="info">
    <div class="ptitle">${esc(disp)}${pinned ? ` <span class="pinb">置顶</span>` : ''}</div>
    <div class="pmeta">共 ${d.gameCount} 款游戏${plat ? ' · ' + plat : ''}<span class="pcmt" data-cpath="/${d.file}"></span></div>
  </div>
  ${covers ? `<div class="covers">${covers}</div>` : ''}
  <div class="arrow">→</div>
</a>`;
  }).join('\n');

  const totalGames = days.reduce((s, d) => s + (Number(d.gameCount) || 0), 0);

  const _cUrl = (SITE.comments.enabled && SITE.comments.url) ? SITE.comments.url.replace(/\/+$/, '') : '';
  const _cAnon = (SITE.comments.enabled && SITE.comments.anonKey) ? SITE.comments.anonKey : '';
  const indexScript = `<script>
(function () {
  var PAGESIZE = 24;
  var lis = document.getElementById('dayLis');
  if (lis) {
    var cards = [].slice.call(lis.children).filter(function (c) { return c.classList && c.classList.contains('post'); });
    var pages = Math.ceil(cards.length / PAGESIZE);
    if (pages > 1) {
      var nav = document.createElement('div');
      nav.className = 'pgbar';
      var h = '<button type="button" class="pg" data-p="-1">‹ 上一页</button>';
      for (var i = 0; i < pages; i++) h += '<button type="button" class="pg" data-p="' + i + '">' + (i + 1) + '</button>';
      h += '<button type="button" class="pg" data-p="' + pages + '">下一页 ›</button>';
      h += '<span class="pginfo">共 ' + pages + ' 页 · 每页 ' + PAGESIZE + ' 个</span>';
      nav.innerHTML = h;
      lis.insertAdjacentElement('afterend', nav);
      var cur = 0;
      function show(p) {
        cards.forEach(function (c, i) { c.style.display = (i >= p * PAGESIZE && i < (p + 1) * PAGESIZE) ? '' : 'none'; });
        [].slice.call(nav.querySelectorAll('.pg')).forEach(function (b) {
          var bp = parseInt(b.getAttribute('data-p'), 10);
          b.classList.toggle('on', bp === p);
          b.classList.toggle('off', (bp === -1 && p === 0) || (bp === pages && p === pages - 1));
        });
        window.scrollTo({ top: lis.getBoundingClientRect().top + window.pageYOffset - 130, behavior: 'smooth' });
      }
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
      show(0);
    }
  }
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

  const index = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SITE_NAME} · 每日更新</title>
${seoHead('', null)}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
header{background:#fff;border-bottom:1px solid #ecebe9;position:sticky;top:0;z-index:10}
.hwrap{max-width:900px;margin:0 auto;padding:16px 20px;display:flex;align-items:center;gap:20px}
.site{font-size:21px;font-weight:800;letter-spacing:1px;color:#2b2b2b;text-decoration:none;flex-shrink:0}
.site img.site-logo{width:140px;height:auto;border-radius:10px;vertical-align:middle;display:inline-block}
.site em{font-style:normal;color:#e5484d}
.site small{font-size:11px;font-weight:400;color:#999;display:block;letter-spacing:0}
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
  .upd-note{font-size:12.5px;color:#999;margin:-14px 0 20px;padding-left:4px;line-height:1.7}
  .dyx-btn{display:inline-flex;align-items:center;margin:-10px 0 20px 4px;padding:7px 16px;border-radius:99px;background:#e5484d;color:#fff;font-size:13px;font-weight:600;text-decoration:none;transition:.2s}
  .dyx-btn:hover{background:#c93a3f;transform:translateY(-1px);box-shadow:0 4px 12px rgba(229,72,77,.35)}
  .pcmt{color:#e58d0a}
  .pgbar{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center;margin:22px 0 6px}
  .pg{border:1px solid #e2ded8;background:#fff;color:#666;border-radius:99px;padding:6px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;transition:.2s}
  .pg:hover:not(.off){border-color:#e5484d;color:#e5484d}
  .pg.on{border-color:#e5484d;background:#e5484d;color:#fff}
  .pg.off{opacity:.35;cursor:default}
  .pginfo{font-size:12px;color:#999;margin-left:6px}
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
.pmeta{font-size:13px;color:#888}
.pinb{display:inline-block;background:#e58d0a;color:#fff;font-size:10px;font-weight:700;padding:1px 7px;border-radius:99px;margin-left:6px;vertical-align:middle}
.covers{display:flex;gap:8px;flex-shrink:0}
.covers img{width:60px;height:60px;object-fit:cover;border-radius:10px;border:1px solid #ecebe9;transition:.25s}
.post:hover .covers img{transform:translateY(-2px)}
.arrow{flex-shrink:0;color:#d5d2cc;font-size:20px;transition:.2s}
.post:hover .arrow{color:#e5484d;transform:translateX(5px)}
.empty{text-align:center;color:#999;padding:40px 0}
.gsect{margin-top:34px}
.ggrid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:10px}
.gcard{display:flex;flex-direction:column;background:#fff;border:1px solid #ecebe9;border-radius:14px;overflow:hidden;text-decoration:none;transition:.25s;box-shadow:0 1px 2px rgba(0,0,0,.03);animation:mrhxCard .5s ease both}
.gcard:hover{border-color:#f0b4b6;transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.08)}
.g-cover{width:100%;aspect-ratio:4/3;overflow:hidden;background:#f4f2ef}
.g-cover img{width:100%;height:100%;object-fit:cover;display:block;transition:.3s}
.gcard:hover .g-cover img{transform:scale(1.04)}
.g-body{padding:12px 14px 14px;display:flex;flex-direction:column;gap:7px;flex:1}
.g-title{font-size:14px;font-weight:700;color:#2b2b2b;line-height:1.45;display:flex;align-items:flex-start;flex-wrap:wrap;gap:5px}
.g-plat{display:inline-block;padding:1px 8px;border-radius:99px;font-size:10px;font-weight:600;color:#fff;background:#e5484d;white-space:nowrap;vertical-align:2px}
.g-src{font-size:11px;color:#aaa}
.g-dls{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:4px}
.g-dl{display:inline-flex;align-items:center;padding:5px 11px;border-radius:99px;font-size:11px;font-weight:600;color:#fff;background:#e5484d;text-decoration:none;transition:.2s}
.g-dl:hover{background:#c93a3f}
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
  .ggrid{grid-template-columns:repeat(2,1fr);gap:10px}
  .g-title{font-size:13px}
}
</style>
<link rel="icon" href="${CDN_URL}/favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="${CDN_URL}/favicon.webp">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="${CDN_URL}/logo.webp" alt="Tsinho黄油推荐站" class="site-logo"></a>
    <div class="site-header-right">
      <form class="mrhx-search" action="search.html" method="get" role="search">
      <input type="text" name="q" placeholder="搜索游戏…" autocomplete="off">
      <button type="submit">搜索</button>
    </form>
      <nav>${navLinks}</nav>
    </div>
  </div>
</header>
<main>
  <div class="upd"><span class="tag">游戏资源</span>本站点共上传了 <b>${totalGames}</b> 款游戏资源</div>
  <div class="upd-note">右上角可搜索游戏（搜"关键词"NO全名）；没搜到的，可在置顶评论区留言游戏全名，站长看到会尽快补上</div>
  <a class="dyx-btn" href="https://tkporl.github.io/hyfxdyx/" target="_blank" rel="noreferrer">单游戏站 · 全部游戏一页直达（推荐）</a>
  <a class="dyx-btn" href="https://yun.139.com/shareweb/#/w/i/2uR1zzgWrrPy9" target="_blank" rel="noreferrer" style="background:#e5484d;color:#fff;border-color:#e5484d">全部黄油（1w+）</a>
  <div class="sect"><h2>每日分享</h2><span>${days.length} 期</span></div>
  <div id="dayLis">${dayLis || '<div class="empty">暂无分享</div>'}</div>
</main>
<footer>${SITE_FOOTER}</footer>
${popupHtml}
${topButton}
${SITE.comments.enabled && SITE.comments.url && SITE.comments.anonKey ? viewScript(SITE.comments.url.replace(/\/+$/, ''), SITE.comments.anonKey, '/index.html') : ''}
${indexScript}
</body>
</html>
`;
  fs.writeFileSync('index.html', index);
  console.log('index.html ok (合集模式), days:', days.length);

  fs.writeFileSync('search_index.json', JSON.stringify(searchIndex));
  console.log('search_index.json ok, games:', searchIndex.length);

  verify(days, index, searchIndex);

  const searchPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>搜索 · ${esc(SITE_NAME)}</title>
${seoHead('search.html', '搜索')}
<link rel="icon" href="${CDN_URL}/favicon.webp" type="image/webp">
<link rel="apple-touch-icon" href="${CDN_URL}/favicon.webp">
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
@media (max-width:720px){body{padding-top:75px}.hwrap{padding:12px 14px}.mrhx-search input{width:110px}main{padding:18px 14px 32px}}
</style>
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html">${SITE_NAME.replace(SITE_LOGO_EM, '<em>' + SITE_LOGO_EM + '</em>')}</a>
    <form class="mrhx-search" action="search.html" method="get" role="search">
      <input type="text" name="q" id="q" placeholder="搜索游戏…" autocomplete="off">
      <button type="submit">搜索</button>
    </form>
  </div>
</header>
<main>
  <div class="sect"><h2>搜索结果</h2><span id="count" role="status" aria-live="polite" aria-atomic="true"></span></div>
  <div id="res" aria-busy="false"></div>
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
    return '<div class="result"><div class="rt"><a href="' + esc(g.source) + '.html">' + esc(g.title) + '</a><span class="src">' + esc(g.source) + '</span></div>' +
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
  resBox.appendChild(moreBtn);
  document.getElementById('mrhx-more').onclick = renderMore;
  if (!q) { countEl.textContent = '（输入关键词搜索）'; resBox.innerHTML = '<div class="empty">输入关键词搜索全站游戏</div>'; document.getElementById('mrhx-more').style.display = 'none'; return; }
  fetch('search_index.json').then(function (r) { return r.json(); }).then(function (data) {
    var kw = q.toLowerCase();
    function fuzzyMatch(text, pattern) {
      var t = (text || '').toLowerCase();
      var p = pattern.toLowerCase();
      if (t.indexOf(p) > -1) return true;
      var pi = 0;
      for (var ti = 0; ti < t.length && pi < p.length; ti++) {
        if (t[ti] === p[pi]) pi++;
      }
      return pi === p.length;
    }
    _hits = data.filter(function (g) {
      return fuzzyMatch(g.title, kw) || fuzzyMatch(g.intro, kw) || fuzzyMatch(g.plat, kw);
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

  // ===== SEO: sitemap.xml + robots.txt =====
  const today = new Date().toISOString().slice(0, 10);
  const smEntries = [{ loc: SITE_URL, pri: '1.0', mod: today }];
  for (const d of days) {
    const fname = path.basename(d.file);
    const key = path.parse(d.file).name;
    const ts = TIMESTAMPS[key];
    const mod = ts ? new Date(ts).toISOString().slice(0, 10) : today;
    smEntries.push({ loc: SITE_URL + fname, pri: '0.6', mod: mod });
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    smEntries.map(e => `  <url><loc>${esc(e.loc)}</loc><lastmod>${esc(e.mod)}</lastmod><priority>${e.pri}</priority></url>`).join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync('sitemap.xml', sitemap);
  console.log('sitemap.xml ok, urls:', smEntries.length);
  fs.writeFileSync('robots.txt',
    'User-agent: *\nAllow: /\nDisallow: /comments-preview.html\nDisallow: /email-preview.html\nDisallow: /site-preview.html\nDisallow: /Tsinhoht.html\n\nSitemap: ' + SITE_URL + 'sitemap.xml\n');
  console.log('robots.txt ok');

  // 自动 commit + push（GitHub Actions 中跳过，由 workflow 处理）
  if (NEW_TAG && NEW_TAG !== 'auto' && !process.env.CI) {
    try {
      execSync('git add -A', { stdio: 'inherit' });
      execSync(`git commit -m "发布 ${NEW_TAG}"`, { stdio: 'inherit' });
      execSync('git push', { stdio: 'inherit' });
      console.log(`\n✅ ${NEW_TAG} 发布完成`);
    } catch (e) {
      console.error('git 操作失败:', e.message);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
