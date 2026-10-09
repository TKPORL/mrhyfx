const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { execSync } = require('child_process');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

// SECURITY: 路径穿越防护——所有 assets/<tag> 拼接都走这里，禁止直接 path.join
// 实现：先用 path.resolve 把 ../ 归一化掉，再校验最终路径必须在 assets/ 之内
function safeAssetDir(tag) {
  // tag 允许中文、字母、数字、点、下划线、连字符（涵盖如 2026827pc / 2026827pcaz 这类字母后缀；
  // 路径越界由下方的 path.resolve 二次校验兜底）
  if (!/^[\u4e00-\u9fa5\w.-]+$/.test(tag)) throw new Error('非法 tag: ' + tag);
  const rootResolved = path.resolve('assets');
  const target = path.resolve(rootResolved, tag);
  const allowed = rootResolved + path.sep;
  if (target !== rootResolved && target.startsWith(allowed) === false) throw new Error('tag 解析后路径越界: ' + tag);
  return target;
}

const POST_DIR = '.';

// 支持命令行传版本号：node scripts/gen.js v2026.8.24（仅 8 位日期格式，先验后用，防止非法参数污染 CDN_URL）
// 修复 #47 假修复：此前 --verify 会被当成 NEW_TAG，把 CDN_URL 改写成 @--verify 污染源文件
const ARGS = process.argv.slice(2);
const VERIFY_ONLY = ARGS.includes('--verify');
const RAW_TAG = ARGS.find(a => !a.startsWith('--')) || null;
if (RAW_TAG && RAW_TAG !== 'auto' && !/^\d{8}(?:[-_][\w.-]+)?$/.test(RAW_TAG)) {
  console.error('非法版本号参数: ' + RAW_TAG + '（应为 8 位日期如 20260912，或 --verify）');
  process.exit(1);
}
const NEW_TAG = VERIFY_ONLY ? null : RAW_TAG;
if (NEW_TAG && NEW_TAG !== 'auto') {
  const genFile = fs.readFileSync(__filename, 'utf8');
  const updated = genFile.replace(
    /(?:let|const) CDN_URL = 'https:\/\/(?:cdn|gcore|fastly|testingcf)\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^']+'/,
    `let CDN_URL = 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@${NEW_TAG}'`
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

// 静态资源版本号：取文件内容的 md5 前 8 位，拼进 <link>/<script> 的查询串。
// 作用：改了站点样式或导航脚本后，访客浏览器不会继续吃旧缓存（否则要等 Pages 缓存过期才生效）。
const assetVer = rel => {
  try { return crypto.createHash('md5').update(fs.readFileSync(rel)).digest('hex').slice(0, 8); }
  catch (e) { return '1'; }
};
const CSS_VER = assetVer('assets/css/site.css');
const NAVJS_VER = assetVer('assets/js/nav.js');
// 丝滑滚动（2026-10-05）：Lenis 本地 vendored + 薄封装，三处注入点（帖子页 / 首页合集 / 空首页）共用
const LENIS_VER = assetVer('assets/js/lenis.min.js');
const SMOOTH_VER = assetVer('assets/js/smooth.js');
const SMOOTH_SCRIPTS = `<script src="assets/js/lenis.min.js?v=${LENIS_VER}"></script>\n<script src="assets/js/smooth.js?v=${SMOOTH_VER}"></script>`;

// ===================== 站点图标资源（2026-09-22 迁到图床 WebP）=====================
// 两处唯一真相都在这里：以后要再换图标，只改这两行，全站页面由 gen.js 重新生成时统一切换。
// 注意：图床走 Telegram 渠道会把 PNG 转成 JPEG（透明丢、变黑底），WebP 不会被转——图标必须用 WebP 直链。
const SITE_LOGO_IMG = 'https://tsinho.us.ci/file/1790008578974_EAFFBCD6D2AB070B24071CFF8B189CCF.webp';
const SITE_ICON_IMG = 'https://tsinho.us.ci/file/1790008576207_80AE7775A1BFBF55701C9E76FBD31274.webp';
const SITE_ICON_TAGS = `<link rel="icon" href="${SITE_ICON_IMG}" type="image/webp">
<link rel="apple-touch-icon" href="${SITE_ICON_IMG}">`;
// 历史遗留的图标声明（本地 favicon.jpg / 旧 CDN 的 favicon.webp、ac9ce9ba、65ce…）统一按这个正则清掉再重注入
const ICON_TAG_RE = /[ \t]*<link rel="(?:icon|apple-touch-icon)"[^>]*>\r?\n?/g;

// ===================== 全站统一顶部导航（2026-09-21 改版）=====================
// 形态：宽屏把菜单项铺开；窄屏（≤540px）收进「更多」按钮，点开在导航栏下方展开；
//   搜索点图标就地展开输入行。交互脚本在 assets/js/nav.js，样式在两处：
//   首页/搜索页模板内联 NAV_CSS，帖子页走 assets/css/site.css。
// 菜单项顺序固定：首页 → 全部黄油 → 解压教程 → 游戏工具。
//   「全部黄油」沿用 links.json（后台可改地址），后两项是站内页。
const NAV_BREAKPOINT = 540;
const NAV_MENU = (() => {
  const all = NAV.find(n => n.label === '全部黄油');
  const items = [{ label: '首页', url: 'index.html' }];
  if (all) items.push({ label: '全部黄油', url: all.url });
  items.push({ label: '解压教程', url: 'tutorial.html' });
  items.push({ label: '游戏工具', url: 'tools.html' });
  items.push({ label: '下载说明', url: 'download.html' });
  items.push({ label: '免责声明', url: 'mianze.html' });
  items.push({ label: '赞助', url: 'sponsor.html' });   // 2026-10-06：赞助入口，按站长要求放最后
  return items.map(n => Object.assign({}, n, { ext: /^https?:/i.test(n.url) }));
})();

// 桌面横排与手机抽屉共用同一份菜单（首页在最上）
// 首页不显示「首页」项——当前页不需要自我导航（2026-10-06 站长要求）
const navLinksHtml = (indent, current) => NAV_MENU
  .filter(n => !(current === 'index.html' && n.url === 'index.html'))
  .map(n =>
    `${indent}<a href="${esc(n.url)}"${n.ext ? ' target="_blank" rel="noreferrer"' : ''}${current === n.url ? ' class="on" aria-current="page"' : ''}>${esc(n.label)}</a>`
  ).join('\n');

const NAV_CSS = `header{position:sticky;top:0;z-index:20;padding:0 20px 0}
.hd-bar{max-width:900px;margin:0 auto;background:#fff;border:1px solid #ecebe9;border-radius:0 0 12px 12px;box-shadow:0 6px 18px rgba(0,0,0,.08);display:flex;align-items:center;gap:12px;padding:7px 12px;min-height:52px}
.hd-bar .logo{display:flex;align-items:center;flex-shrink:0;text-decoration:none}
.hd-bar .logo img{width:118px;height:auto;border-radius:8px;display:block}
.hd-bar .menu{display:flex;align-items:center;justify-content:space-evenly;gap:1px;flex:1;min-width:0;flex-wrap:nowrap;overflow:hidden;max-width:1000px;transition:max-width .34s cubic-bezier(.2,.8,.2,1),transform .34s cubic-bezier(.2,.8,.2,1),visibility 0s linear 0s}
.hd-bar .menu a{font-size:13px;color:#555;text-decoration:none;padding:9px 26px;border:1px solid #ecebe9;background:#fff;border-radius:10px;white-space:nowrap;transition:color .18s ease,background .18s ease,border-color .18s ease,opacity .26s ease,transform .3s cubic-bezier(.2,.8,.2,1)}
.hd-bar .menu a:nth-child(1){transition-delay:0s,0s,0s,.12s,.12s}
.hd-bar .menu a:nth-child(2){transition-delay:0s,0s,0s,.08s,.08s}
.hd-bar .menu a:nth-child(3){transition-delay:0s,0s,0s,.04s,.04s}
.hd-bar .menu a:nth-child(4){transition-delay:0s,0s,0s,0s,0s}
.hd-bar .menu a:hover,.hd-bar .menu a.on{color:#e5484d;background:#fdf3f3;border-color:#f0b4b6}
.hd-bar .acts{display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:auto}
.hd-bar .icon-btn{width:36px;height:36px;border-radius:50%;border:1px solid #ecebe9;background:#faf9f7;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.18s;font:inherit;padding:0}
.hd-bar .icon-btn:hover{background:#fdf3f3;border-color:#f0b4b6}
.hd-bar .icon-btn svg{width:18px;height:18px;stroke:#666;fill:none;stroke-width:1.6;stroke-linecap:round}
.hd-bar .icon-btn:hover svg{stroke:#e5484d}
.hd-bar .icon-btn[aria-expanded="true"]{background:#e5484d;border-color:#e5484d}
.hd-bar .icon-btn[aria-expanded="true"] svg{stroke:#fff}
.hd-bar .icon-btn:hover .dot{fill:#e5484d}
.hd-bar .more-btn[aria-expanded="true"] .dot{fill:#fff}
.hd-bar .more-btn{transition:opacity .3s cubic-bezier(.2,.8,.2,1) .24s,transform .3s cubic-bezier(.2,.8,.2,1) .24s,width .3s cubic-bezier(.2,.8,.2,1) .24s,border-width .3s ease .24s,visibility 0s linear 0s}
.hd-bar .dot{transform-box:fill-box;transform-origin:center;transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .2s ease}
.hd-bar .more-btn[aria-expanded="true"] .dot-1{transform:translateX(5.5px) rotate(45deg) scaleX(2.8)}
.hd-bar .more-btn[aria-expanded="true"] .dot-3{transform:translateX(-5.5px) rotate(-45deg) scaleX(2.8)}
.hd-bar .more-btn[aria-expanded="true"] .dot-2{transform:scale(0);opacity:0}
.nav-drop{display:grid;grid-template-rows:0fr;transition:grid-template-rows .3s cubic-bezier(.2,.8,.2,1)}
.nav-drop.open{grid-template-rows:1fr}
.nav-drop>div{overflow:hidden;min-height:0}
.nav-drop .drop-inner{max-width:900px;margin:8px auto 0;background:#fff;border:1px solid #ecebe9;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.07);padding:6px;opacity:0;transform:translateY(-6px);transition:opacity .24s ease,transform .3s cubic-bezier(.2,.8,.2,1)}
.nav-drop.open .drop-inner{opacity:1;transform:translateY(0)}
.nav-drop .search-row{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 14px}
.nav-drop .search-row input{flex:1;min-width:0;font:inherit;font-size:13.5px;border:none;outline:none;background:transparent;color:#2b2b2b;padding:9px 0}
.nav-drop .search-row input::placeholder{color:#b4b2a9}
.nav-drop .search-row .go{width:34px;height:34px;border-radius:9px;border:none;background:#e5484d;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:.2s}
.nav-drop .search-row .go:hover{background:#c93a3f}
.nav-drop .search-row .go svg{width:16px;height:16px;stroke:#fff;fill:none;stroke-width:1.8;stroke-linecap:round}
.nav-drop .search-row .x{width:32px;height:32px;border-radius:50%;border:1px solid #ecebe9;background:#faf9f7;cursor:pointer;color:#888;font:inherit;font-size:15px;line-height:1;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:.2s}
.nav-drop .search-row .x:hover{border-color:#f0b4b6;color:#e5484d}
.nav-drop .drop-menu{display:flex;flex-wrap:wrap;gap:4px;padding:4px}
.nav-drop .drop-menu a{font-size:13.5px;color:#555;text-decoration:none;padding:9px 13px;border-radius:9px;background:#faf9f7;border:1px solid #f0eeec;white-space:nowrap;transition:.18s}
.nav-drop .drop-menu a:hover,.nav-drop .drop-menu a.on{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
@media (min-width:681px){.hd-bar .more-btn{opacity:0;transform:scale(.88);width:0;border-width:0;pointer-events:none;visibility:hidden;transition:opacity .28s cubic-bezier(.2,.8,.2,1),transform .28s cubic-bezier(.2,.8,.2,1),width .28s cubic-bezier(.2,.8,.2,1),border-width .28s ease,visibility 0s linear .3s}}
@media (max-width:680px){.hd-bar .menu{max-width:0;transform:translateX(26px);pointer-events:none;visibility:hidden;transition:max-width .34s cubic-bezier(.2,.8,.2,1),transform .34s cubic-bezier(.2,.8,.2,1),visibility 0s linear .38s}.hd-bar .menu a{opacity:0;transform:translateX(22px)}.hd-bar .menu a:nth-child(1){transition-delay:0s,0s,0s,0s}.hd-bar .menu a:nth-child(2){transition-delay:0s,0s,.03s,.03s}.hd-bar .menu a:nth-child(3){transition-delay:0s,0s,.06s,.06s}.hd-bar .menu a:nth-child(4){transition-delay:0s,0s,.09s,.09s}.nav-drop .drop-menu a{flex:1 1 auto;text-align:center}}
@media (max-width:720px){header{padding:0 14px 0}.hd-bar{padding:7px 12px;gap:10px}.hd-bar .logo img{width:100px}.hd-bar .icon-btn{width:34px;height:34px}.nav-drop .drop-menu a{font-size:13px;padding:8px 10px}}
@media (max-width:680px){
  /* 手机端：「更多」菜单改为左侧抽屉（2026-10-03 用户定稿，替代原来横排展开的 drop-menu） */
  .nav-mask{position:fixed;inset:0;background:rgba(20,18,17,.34);opacity:0;pointer-events:none;transition:opacity .28s ease;z-index:40}
  .nav-mask.open{opacity:1;pointer-events:auto}
  #mrhxMoreDrop{position:fixed;inset:0;z-index:41;display:block;opacity:0;pointer-events:none;transition:opacity .28s ease}
  #mrhxMoreDrop.open{opacity:1;pointer-events:auto}
  #mrhxMoreDrop>div{overflow:visible;height:100%}
  #mrhxMoreDrop .drop-inner{position:absolute;top:0;left:0;bottom:0;width:272px;margin:0;border:0;border-right:1px solid #ecebe9;border-radius:0 14px 14px 0;box-shadow:6px 0 28px rgba(0,0,0,.12);padding:0;display:flex;flex-direction:column;overflow:hidden;opacity:1;transform:translateX(-102%);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
  #mrhxMoreDrop.open .drop-inner{transform:none}
  #mrhxMoreDrop .drawer-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #f0eeec;flex-shrink:0}
  #mrhxMoreDrop .drawer-head img{width:104px;border-radius:8px;display:block}
  #mrhxMoreDrop .drawer-close{width:32px;height:32px;border-radius:50%;border:1px solid #ecebe9;background:#faf9f7;color:#666;font:inherit;font-size:18px;line-height:1;cursor:pointer;flex-shrink:0}
  #mrhxMoreDrop .drawer-close:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
  #mrhxMoreDrop .drop-menu{flex-direction:column;flex-wrap:nowrap;gap:8px;padding:12px 14px;overflow-y:auto;flex:0 1 auto}
  #mrhxMoreDrop .drop-menu a{flex:0 0 auto;display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;color:#3a3a3a;background:#faf9f7;border:1px solid #ecebe9;padding:13px 14px;border-radius:12px;text-align:left;box-shadow:0 1px 0 rgba(0,0,0,.02)}
  #mrhxMoreDrop .drop-menu a:hover,#mrhxMoreDrop .drop-menu a.on{background:#fdf3f3;border-color:#f0b4b6;color:#e5484d}
}
@media (prefers-reduced-motion: reduce){.hd-bar .dot,.nav-drop,.nav-drop .drop-inner,.hd-bar .more-btn,.hd-bar .menu,.hd-bar .menu a{transition:none}}`;

const navHeaderHtml = (current, inputId) => `<div class="hd-bar">
  <a class="logo" href="index.html"><img src="${SITE_LOGO_IMG}" alt="${esc(SITE_NAME)}"></a>
  <nav class="menu" aria-label="主导航">
${navLinksHtml('    ', current)}
  </nav>
  <div class="acts">
    <button type="button" class="icon-btn search-btn" aria-label="搜索游戏" aria-expanded="false" aria-controls="mrhxSearchDrop">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.8"/><path d="M16.2 16.2L21 21"/></svg>
    </button>
    <button type="button" class="icon-btn more-btn" aria-label="更多导航" aria-expanded="false" aria-controls="mrhxMoreDrop">
      <svg viewBox="0 0 24 24" style="stroke:none">
        <circle class="dot dot-1" cx="6.5" cy="12" r="1.9" fill="#666"></circle>
        <circle class="dot dot-2" cx="12" cy="12" r="1.9" fill="#666"></circle>
        <circle class="dot dot-3" cx="17.5" cy="12" r="1.9" fill="#666"></circle>
      </svg>
    </button>
  </div>
</div>

<div class="nav-drop" id="mrhxSearchDrop">
  <div>
    <div class="drop-inner">
      <form class="search-row" action="search.html" method="get" role="search">
        <input type="text" name="q"${inputId ? ` id="${inputId}"` : ''} placeholder="开启精彩搜索" autocomplete="off" aria-label="搜索游戏名称">
        <button class="go" type="submit" aria-label="开始搜索"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.8"/><path d="M16.2 16.2L21 21"/></svg></button>
        <button class="x" type="button" data-nav-close aria-label="关闭搜索">×</button>
      </form>
    </div>
  </div>
</div>

<div class="nav-drop" id="mrhxMoreDrop">
  <div>
    <div class="drop-inner">
      <div class="drawer-head">
        <img src="${SITE_LOGO_IMG}" alt="${esc(SITE_NAME)}">
        <button type="button" class="drawer-close" data-nav-close aria-label="关闭菜单">×</button>
      </div>
      <nav class="drop-menu" aria-label="站点导航">
${navLinksHtml('        ', current)}
      </nav>
    </div>
  </div>
</div>
<div class="nav-mask" id="mrhxNavMask"></div>`;

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

// 配置「半开」守卫（2026-09-18 事故防御）
// 事故复盘：site.json 被残缺版本覆盖后 comments 变成 enabled=false 且 url/anonKey 全空，
//   生成脚本按配置正常移除了全站评论区与统计脚本，而 verify() 的注入校验里带了
//   `SITE.comments.enabled &&` 前置条件被自身短路，导致全程零报错、静默发布了无评论区的页面。
// 此处拦截「以为开着评论、实际缺地址或密钥」的状态，避免同类配置损坏再次静默扩散。
{
  const c = SITE.comments || {};
  if (c.enabled && (!c.url || !c.anonKey)) {
    console.error('❌ site.json 的 comments 配置不完整，已中止生成：');
    console.error('   enabled=' + c.enabled + '，url=' + (c.url ? '已填' : '空') + '，anonKey=' + (c.anonKey ? '已填' : '空'));
    console.error('   继续生成会把全站评论区与统计脚本一并移除。请先补全配置（或把三项同时清空以表示不启用）。');
    process.exit(1);
  }
}

// #48：非帖子页排除名单从 site.json 的 build.excludePosts 读；硬编码默认名单兼并，配置丢了也不会把后台页当帖子
const DEFAULT_EXCLUDE = ['index.html', 'publish.html', 'Tsinhoht.html', 'search.html', 'email-preview.html', 'comments-preview.html', 'site-preview.html', 'jinri.html', '404.html', 'download.html', 'mianze.html', '卡片布局原型.html', '图床对接演示.html'];
const EXCLUDE = new Set([...DEFAULT_EXCLUDE, ...((SITE.build && Array.isArray(SITE.build.excludePosts)) ? SITE.build.excludePosts : [])]);
const files = fs.readdirSync(POST_DIR).filter(f => /\.html$/i.test(f) && !EXCLUDE.has(f));
if (!files.length) console.warn('未找到每日分享导出文件，将生成空首页');

const DOWNLOAD_BUTTONS = (SITE.downloadButtons && Array.isArray(SITE.downloadButtons))
  ? SITE.downloadButtons
  : [
      { name: '百度网盘', pattern: 'pan.baidu.com', cls: 'mrhx-btn-b', type: 'baidu' },
      { name: '移动云盘（不限速）', pattern: 'yun.139.com', cls: 'mrhx-btn-m', type: 'mobile' }
    ];

const SITE_NAME = (SITE.site && SITE.site.name) || 'Tsinho黄油推荐站';
const SITE_LOGO_EM = (SITE.site && SITE.site.logoEm) || '分享';
const SITE_TAG = (SITE.site && SITE.site.tag !== undefined) ? SITE.site.tag : '每日更新 · PC + 安卓双平台';
const SITE_FOOTER = (SITE.site && SITE.site.footer !== undefined) ? SITE.site.footer : 'by Tsinho 发布 · 本站仅供学习交流，请于下载后 24 小时内删除，支持正版';
const SITE_AUTHOR = 'Tsinho';
// 免责声明（2026-10-03）：文案与开关全在 site.json 的 disclaimer 段，后台可改；
//   页脚统一渲染成 disclaimerFoot(brief)：2026-10-03 起全站统一精简为一行
//   「by Tsinho… · 完整免责声明」——邮箱与完整条款只在 mianze.html 出现，不在每页重复堆。
const SITE_EMAIL = (SITE.site && SITE.site.email) || '';
const DISC = SITE.disclaimer || {};
// 帖子页/qzt 用 brief 模式：完全回到加免责声明之前的样子——只留原 footer 一行，不加任何声明或链接。
// 免责声明页 mianze.html 仍挂在导航里，想看的人自己点。
const disclaimerFoot = (brief) => {
  if (!DISC.enabled || brief) return SITE_FOOTER;
  const link = `<a class="disc-link" href="${esc(DISC.url || 'mianze.html')}">完整免责声明</a>`;
  const mail = SITE_EMAIL
    ? `侵权或版权问题请联系 <a class="foot-mail" href="mailto:${SITE_EMAIL}">${SITE_EMAIL}</a>`
    : '侵权或版权问题请联系站长';
  return `${mail}<br><span class="disc">${esc(DISC.short || '')}</span><br>`
    + `${esc(SITE_FOOTER)} · ${link}`;
};
// 图片域名统一用 cdn.jsdelivr.net（站长实测：新上传图偶有缓存延迟但可用；gcore 等镜像在站长网络下反而不可靠）。
//   历史页面里残留的其他 jsdelivr 镜像域名会被 localize 统一改写回主域
let CDN_URL = 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main';
// 自建图床（CloudFlare-ImgBed）直链：帖子发布时若走图床模式，图片 src 是图床完整外链。
//   这些链接必须原样保留，不能被 localize 当外链下载回 GitHub 仓库（等于白搬），也不能被改写成 jsDelivr。
//   域名从 site.json 的 imgbed.baseUrl 读（后台「保存配置到站点」写入）；额外兜底内置当前已知图床域名，防止漏配。
const IMGBED_BASES = new Set();
if (SITE.imgbed && SITE.imgbed.baseUrl) IMGBED_BASES.add(String(SITE.imgbed.baseUrl).replace(/\/+$/, ''));
IMGBED_BASES.add('https://tsinho-cloudflare-imgbed.pages.dev');
IMGBED_BASES.add('https://tsinho.us.ci');
IMGBED_BASES.add('https://cloudflare-imgbed-e3b.pages.dev');

// ===== 图床兜底：图床打不开时，浏览器自动换 GitHub(jsDelivr) 里的备份图 =====
//   映射表由 scripts/backup_imgbed.js 生成：图床文件名 -> assets/imgbed/ 下去重后的文件名
const IMGBED_MAP_FILE = path.join('assets', 'imgbed', '_map.json');
let IMGBED_MAP = {};
try {
  if (fs.existsSync(IMGBED_MAP_FILE)) {
    IMGBED_MAP = JSON.parse(fs.readFileSync(IMGBED_MAP_FILE, 'utf8'));
  }
} catch (e) {
  IMGBED_MAP = {};
}

function injectImgFallback(html) {
  if (!Object.keys(IMGBED_MAP).length) return html;
  // 匹配图床直链 /file/xxx.webp 与 /file/子目录/xxx.webp；
  // fname 捕获 /file/ 之后整段（可含子目录），与 _map.json 的键（backup_imgbed.js 列出的 name，含目录）对齐。
  // 2026-09-27 修复：原正则只取最后一段文件名，按目录归类的图（后台 uploadFolder）全部查不到映射、漏兜底。
  return html.replace(
    /<img\b([^>]*?)\bsrc="(https:\/\/[^"]*?\/file\/([^"?]+\.[A-Za-z0-9]+))"([^>]*?)>/g,
    (m, pre, url, fname, post) => {
      if (/onerror=/i.test(pre + post)) return m; // 已经有兜底就别重复加
      const local = IMGBED_MAP[fname] || IMGBED_MAP[fname.split('/').pop()];
      if (!local) return m; // 这张图还没备份过，跳过
      const fb = `${CDN_URL}/assets/imgbed/${local}`;
      return `<img${pre}src="${url}" onerror="this.onerror=null;this.src='${fb}'"${post}>`;
    }
  );
}
// jsDelivr 国内被墙/污染时封面全裂（2026-10-01 访客反馈）：给 jsDelivr gh 图链注入 onerror，
// 失败自动切 GitHub Pages 同路径（访客能打开网站 = Pages 域名在其网络下可达，图片就在仓库里）
function injectJsdelivrFallback(html) {
  // 2026-10-01 定稿：jsDelivr 在国内反复被墙/挂起（访客图全裂+无限转圈），主链直接换成 GitHub Pages
  // （访客能打开网站 = Pages 域名在其网络下可达，图片就在仓库里），jsDelivr 降级为 onerror 备用源。
  // 情况1：src 仍是 jsDelivr（无论有无旧 onerror）——主链改 Pages，onerror 统一切 jsDelivr
  html = html.replace(
    /(<img\b[^>]*?\bsrc=")https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^\/"]+(\/assets\/[^"]+)("[^>]*?>)/g,
    (m, pre, path, post) => {
      // pre 已含 <img 和 src="，post 已含 src 闭引号"和结尾 >——都不能再写（2026-10-01 双<img/双src/双> 各踩过一次）
      return `${pre}https://tkporl.github.io/mrhyfx${path}" onerror="this.onerror=null;this.src='https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main${path}'${post}`;
    }
  );
  // 情况2：src 已是 Pages 但 onerror 还指向 Pages（上一版兜底产物）——把 onerror 反转为 jsDelivr
  html = html.replace(
    /(<img\b[^>]*?\bsrc="https:\/\/tkporl\.github\.io\/mrhyfx)(\/assets\/[^"]+)("[^>]*?onerror="this\.onerror=null;this\.src=')https:\/\/tkporl\.github\.io\/mrhyfx(\/assets\/[^']*)(')/g,
    (m, head, path, mid, path2, tail) => `${head}${path}${mid}https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main${path2}'${tail}`
  );
  return html;
}
function isImgBedUrl(u) {
  for (const b of IMGBED_BASES) if (b && u.startsWith(b + '/')) return true;
  return false;
}
const GRID2_POSTS = new Set(files.map(f => path.parse(f).name));

// ===== SEO =====
const SITE_URL = ((SITE.seo && SITE.seo.url) || 'https://tkporl.github.io/mrhyfx/').replace(/\/+$/, '') + '/';
const SEO_DESCRIPTION = (SITE.seo && SITE.seo.description) ||
  'Tsinho黄油站（Tsinho黄油推荐站·Tsinho工作室）每日更新：PC+安卓双平台黄油游戏分享，AI汉化、官方中文，移动云盘与百度网盘直达下载，支持游戏求助与补档。';
// #27：meta keywords 搜索引擎早已不用，删除（不再注入）
function seoHead(file, pageTitle, opts) {
  // #25：opts.desc —— 帖子页拼本期游戏名；#24：opts.ogImg —— 帖子页/首页用首期游戏封面作分享卡
  const o = opts || {};
  const t = pageTitle ? `${pageTitle} · ${SITE_NAME}` : `${SITE_NAME} · 每日更新`;
  const url = file ? SITE_URL + file : SITE_URL;
  const desc = (o.desc || SEO_DESCRIPTION).slice(0, 120);
  const V = (SITE.seo && SITE.seo.verification) || {};
  const verif = [
    V.google && `<meta name="google-site-verification" content="${esc(V.google)}">`,
    V.bing && `<meta name="msvalidate.01" content="${esc(V.bing)}">`,
    V.baidu && `<meta name="baidu-site-verification" content="${esc(V.baidu)}">`,
    V.sogou && `<meta name="sogou_site_verification" content="${esc(V.sogou)}">`,
    V.yandex && `<meta name="yandex-verification" content="${esc(V.yandex)}">`
  ].filter(Boolean).join('\n');
  return [
    `<meta name="description" content="${esc(desc)}">`,
    `<meta name="author" content="${esc(SITE_AUTHOR)}">`,
    `<meta name="robots" content="index,follow">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(t)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${esc(o.ogImg || (CDN_URL + '/logo.webp'))}">`,
    verif
  ].filter(Boolean).join('\n');
}

const nodeExpandScript = `<!--mrhx-expand--><script>
(function () {
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // 创建模态框容器
  var modal = document.createElement('div');
  modal.className = 'mrhx-detail';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '游戏介绍');
  // data-lenis-prevent：Lenis 平滑滚动接管了全页 wheel，弹窗内盒子有 overflow:auto 却不告诉它，
  //   滚轮就全被拿去滚底层页面（2026-10-06 用户反馈：点开游戏介绍滑不动，滚的是帖子）。
  //   加上这个官方属性后，滚轮在弹窗内部生效，弹窗内容可正常上下滑。
  modal.innerHTML = '<div class="mrhx-detail-box" data-lenis-prevent><button type="button" class="mrhx-detail-close" aria-label="关闭">✕</button><h2></h2><div class="mrhx-detail-from"></div><div class="mrhx-detail-text"></div><button type="button" class="mrhx-detail-back">返回</button></div>';
  document.body.appendChild(modal);
  var box = modal.querySelector('.mrhx-detail-box');
  var closeBtn = box.querySelector('.mrhx-detail-close');
  var backBtn = box.querySelector('.mrhx-detail-back');
  var h2 = box.querySelector('h2');
  var from = box.querySelector('.mrhx-detail-from');
  var text = box.querySelector('.mrhx-detail-text');

  // ===== 弹窗从「被点击的那张游戏卡片」长出来，关闭时原路收回同一张卡片 =====
  // 做法：分别量出触发卡片与弹窗在屏幕上的位置，把弹窗先摆到卡片上（起始帧），
  //       再过渡到最终位置（FLIP）。起点锚定在触发元素上，不会从屏幕中央凭空出现。
  var ANIM_IN = 'transform .36s cubic-bezier(.2,1.16,.32,1),opacity .18s ease';
  var ANIM_OUT = 'transform .26s cubic-bezier(.4,0,.72,.35),opacity .2s ease';
  var trigger = null;
  var isOpen = false;
  var closing = false;

  // 取弹窗「未变形」时的位置：动画途中（弹窗正被缩放）关闭时，直接量会拿到缩小后的矩形，
  // 算出来的落点会偏。这里临时清掉 transform 再量，同一帧内还原，不会闪。
  function boxRect() {
    var prev = box.style.transform;
    box.style.transform = 'none';
    var r = box.getBoundingClientRect();
    box.style.transform = prev;
    return r;
  }

  function anchor() {
    if (!trigger || !trigger.getBoundingClientRect) return null;
    var t = trigger.getBoundingClientRect();
    var b = boxRect();
    if (!b.width || !b.height) return null;
    // 触发卡片滚出视口后，把锚点夹回视口内，避免弹窗朝屏幕外飞走
    var cx = Math.min(Math.max(t.left + t.width / 2, 0), window.innerWidth);
    var cy = Math.min(Math.max(t.top + t.height / 2, 0), window.innerHeight);
    var sx = Math.max(Math.min(t.width / b.width, 1), .04);
    var sy = Math.max(Math.min(t.height / b.height, 1), .04);
    return { dx: cx - (b.left + b.width / 2), dy: cy - (b.top + b.height / 2), sx: sx, sy: sy };
  }

  function at(a) {
    return 'translate(' + a.dx.toFixed(1) + 'px,' + a.dy.toFixed(1) + 'px) scale(' + a.sx.toFixed(4) + ',' + a.sy.toFixed(4) + ')';
  }

  function openFrom(el) {
    trigger = el;
    isOpen = true;
    box.style.willChange = 'transform';
    modal.classList.add('show');
    var a = reduce ? null : anchor();
    box.style.transition = 'none';
    if (a) {
      box.style.transformOrigin = 'center center';
      box.style.transform = at(a);   // 起始帧就贴在触发卡片上
      box.style.opacity = '0';
      void box.offsetWidth;          // 强制回流，保证起始帧先渲染出来再动
      box.style.transition = ANIM_IN;
      box.style.transform = 'translate(0px,0px) scale(1,1)';
      box.style.opacity = '1';
    } else {
      box.style.transform = 'none';
      box.style.opacity = '1';
    }
    try { closeBtn.focus({ preventScroll: true }); } catch (err) { closeBtn.focus(); }
  }

  function restore() {
    box.style.transition = 'none';
    box.style.transform = 'none';
    box.style.opacity = '1';
    box.style.willChange = '';
    modal.classList.remove('show');
    isOpen = false;
    closing = false;
    if (trigger && trigger.focus) {
      try { trigger.focus({ preventScroll: true }); } catch (err) { trigger.focus(); }
    }
    trigger = null;
  }

  function closeModal() {
    if (!isOpen || closing) return;
    closing = true;
    var a = reduce ? null : anchor();
    if (!a) { restore(); return; }
    var finished = false;
    var finish = function () {
      if (finished) return;
      finished = true;
      box.removeEventListener('transitionend', onEnd);
      restore();
    };
    var onEnd = function (e) {
      if (e && (e.target !== box || e.propertyName !== 'transform')) return;
      finish();
    };
    box.style.transition = ANIM_OUT;
    box.style.transform = at(a);
    box.style.opacity = '0';
    box.addEventListener('transitionend', onEnd);
    setTimeout(finish, 420);   // 兜底：过渡被中断时也要收干净
  }

  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target === closeBtn || e.target === backBtn) closeModal();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && isOpen) closeModal(); });

  document.querySelectorAll('.node.heading3').forEach(function (n) {
    if (n.classList.contains('node-full')) return;
    var img = n.querySelector('.image-list img');
    if (!img) return;
    var tip = document.createElement('span');
    tip.className = 'img-tip';
    tip.textContent = '点击图片查看完整介绍';
    n.appendChild(tip);
    // 提取游戏名（从 content 的 em.mrhx-plat 前的文本）
    var contentEl = n.querySelector('.content');
    var gameName = '';
    var gamePlat = '';
    if (contentEl) {
      var em = contentEl.querySelector('.mrhx-plat');
      gamePlat = em ? em.textContent.trim() : '';
      var clone = contentEl.cloneNode(true);
      var emInClone = clone.querySelector('.mrhx-plat');
      if (emInClone) emInClone.remove();
      gameName = clone.textContent.replace(/\s+/g, ' ').trim();
    }
    // 提取来源（从 note 或 content）
    var noteEl = n.querySelector('.note');
    var fromText = '';
    if (noteEl) {
      var noteClone = noteEl.cloneNode(true);
      noteClone.querySelectorAll('.mrhx-btn,.mrhx-dl').forEach(function(b){b.remove();});
      fromText = noteClone.textContent.replace(/\s+/g, ' ').trim();
    }
    img.setAttribute('tabindex', '0');
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', '查看完整介绍：' + gameName);
    function activate(e) {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      if (closing) return;
      h2.textContent = gameName + (gamePlat ? ' [' + gamePlat + ']' : '');
      from.innerHTML = '<b>游戏介绍</b>';
      text.textContent = gamePlat || '';
      // note 区域的游戏描述放到弹窗正文
      if (noteEl) {
        var noteDesc = noteEl.cloneNode(true);
        noteDesc.querySelectorAll('.mrhx-btn,.mrhx-dl').forEach(function(b){b.remove();});
        var descText = noteDesc.textContent.replace(/\s+/g, ' ').trim();
        if (descText) text.textContent = descText;
      }
      openFrom(img);
    }
    img.addEventListener('click', activate);
    // 键盘同样可打开（图片原本只响应鼠标点击）
    img.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') activate(e);
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

const topButton = `<button type="button" class="mrhx-top" id="mrhxTopBtn" title="滚动到底部">↓</button>
<script>
(function () {
  var b = document.getElementById('mrhxTopBtn');
  if (!b) return;
  function maxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }
  // 修复：旧版用浏览器 smooth 滚动 + 350ms 轮询补滚，每次动画到“旧高度”末端都会停一下再重新启动，
  //   懒加载撑高页面时表现为“中间卡一下、快到底又卡一下”。
  //   改为自绘逐帧滚动：每帧实时取最新页高、速度从慢到快，页面被撑高也无缝跟进，不经过浏览器 smooth 动画不会停顿；
  //   用户滚轮/触摸/键盘打断时自动停止
  function toBottom() {
    if (b._auto) return;
    b._auto = true;
    var stop = function () {
      b._auto = false;
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    var v = 0;
    var frame = function () {
      if (!b._auto) return;
      var y = window.scrollY || document.documentElement.scrollTop;
      var h = maxScroll();
      if (h - y <= 2) { stop(); return; }
      v = Math.min(v + 2.5, 120);
      window.scrollTo(0, Math.min(y + v, h));
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
  function t() {
    var y = window.scrollY || document.documentElement.scrollTop;
    var h = maxScroll();
    // 方向感知：最近一次是往下滑就提供“去底部↓”，往上滑就“回顶部↑”；贴顶强制↓、贴底强制↑。
    //   旧逻辑“除贴顶外一律↑”导致往下滑一点就永远只能回顶部
    var dirDown = y >= lastY; lastY = y;
    var nearTop = y < 100;
    var nearBottom = h - y < 100;
    if (nearTop || (!nearBottom && dirDown)) { b.textContent = '\u2193'; b.title = '滚动到底部'; b.onclick = toBottom; }
    else { b.textContent = '\u2191'; b.title = '滚动到顶部'; b.onclick = function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }; }
    b.classList.add('show');
  }
  var lastY = 0;
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

// #12：帖子页不再内联重复的统计代码，改为引用公共文件 assets/js/track.js（构建时由 writeSharedAssets 写出）
// #8：保留注释锚点，重跑时整段替换，不会重复注入
const viewScript = (sb, key, path) => `<!--view-track-->
<script>window.MRHXT={sb:'${sb}',key:'${key}',path:'${path}'};</script>
<script src="assets/js/track.js"></script>
<!--view-track-end-->`;

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
      const dirs = fs.readdirSync('assets').filter(d => fs.statSync(safeAssetDir(d)).isDirectory());
      const longer = dirs.filter(d => d.startsWith(base) && d !== base).sort((a, b) => b.length - a.length);
      if (longer.length) return longer[0];
    } catch (e) {}
    // Fall back to exact base match
    if (fs.existsSync(safeAssetDir(base))) return base;
    return base;
  }
  return name;
}

function iconTitle(d) {
  const cut = d.split(/[（(]/)[0].trim();
  return cut || d;
}

async function localize(html, tag) {
  // #15：先把所有旧 CDN 链接（任意 jsdelivr 镜像域名/任意 tag）统一改写到主源 @main，不需要重新下载
  html = html.replace(/(?:cdn|gcore|fastly|testingcf)\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^/"]+/g, `${CDN_URL.replace(/^https:\/\//, '')}`);
  html = html.replace(/https:\/\/(?:cdn|gcore|fastly|testingcf)\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@main/g, CDN_URL);
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

  // 新上传回退格式的文件带清理标记：把后台使用的 Pages 绝对链接转成本地路径，
  // 后续 WebP 替换才能命中；历史图片没有标记，因此不改动。
  html = switchMarkedNewImageUrls(html, tag);

  const urls = [...new Set([...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map(m => m[1]))]
    .filter(url => !url.includes(CDN_URL) && !/jsdelivr\.net\/gh\/TKPORL\/mrhyfx/.test(url) && !url.includes('tkporl.github.io/mrhyfx') && !isImgBedUrl(url));
  if (urls.length) {
    // SECURITY: tag 走 safeAssetDir，固定白名单正则 + 路径边界校验
    const dir = safeAssetDir(tag);
    fs.mkdirSync(dir, { recursive: true });
    // #16：5 路并发下载池（原为逐张串行，每张都要等上一张下完+压缩完）；
    //   文件名按原顺序预分配 img_NN，sharp 压缩在各自任务内完成，结果互不干扰
    const names = urls.map((_, i) => `img_${String(i + 1).padStart(2, '0')}.webp`);
    let done = 0;
    const queue = urls.map((url, idx) => async () => {
      const name = names[idx];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const buf = Buffer.from(await res.arrayBuffer());
          const compressed = await sharp(buf)
            .webp({ quality: 50, alphaQuality: 100, lossless: false })
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
      done++;
    });
    let qi = 0;
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (qi < queue.length) { const job = queue[qi++]; await job(); }
    });
    await Promise.all(workers);
  }
  // #12：公共脚本/样式目录（assets/js、assets/css）与图床备份目录（assets/imgbed）不参与帖子图片目录重写，
  //   否则会被误改写成 assets/<tag>/（imgbed 备份图全 404，2026-10-01 老帖图全裂事故根因）
  html = html.replace(/assets\/(?!js\/|css\/|imgbed\/)[^"\/]+(?=\/)/g, 'assets/' + tag);
  html = html.replace(/src="assets\/(?!js\/|css\/)/g, `src="${CDN_URL}/assets/`);
  html = html.replace(/href="assets\/(?!js\/|css\/)/g, `href="${CDN_URL}/assets/`);
  // #13：帖子卡片图懒加载（每帖首图不懒，保证首屏立即出图）
  // 先清除旧 lazy 标记再重新打（修正历史误标，如首卡被误懒）；logo/favicon 等非卡片图不占豁免名额
  html = html.replace(/<img\b([^>]*)>/gi, (m, attrs) => {
    if (!/loading="lazy"/.test(attrs)) return m;
    return `<img${attrs.replace(/\s*loading="lazy"/g, '').replace(/\s*decoding="async"/g, '')}>`;
  });
  let cardIdx = 0;
  html = html.replace(/<img\b(?![^>]*loading=)([^>]*)>/gi, (m, attrs) => {
    if (!/class="[^"]*image/.test(attrs)) return m; // 只懒加载游戏卡片图
    cardIdx++;
    if (cardIdx <= 1) return m; // 每帖首张卡片图不懒加载
    return `<img loading="lazy" decoding="async"${attrs}>`;
  });
  return html.split('crossorigin="anonymous"').join('');
}

function switchMarkedNewImageUrls(html, tag) {
  const dir = safeAssetDir(tag);
  if (!fs.existsSync(dir)) return html;
  for (const marker of fs.readdirSync(dir).filter(name => name.endsWith('.mrhx-delete-after-webp'))) {
    const sourceName = marker.slice(0, -'.mrhx-delete-after-webp'.length);
    if (!/^[a-zA-Z0-9_-]+\.(?:png|jpe?g|bmp|tiff)$/i.test(sourceName)) continue;
    const absolute = `https://tkporl.github.io/mrhyfx/assets/${tag}/${sourceName}`;
    const webpName = path.parse(sourceName).name + '.webp';
    const target = fs.existsSync(path.resolve(dir, webpName)) ? `assets/${tag}/${webpName}` : `assets/${tag}/${sourceName}`;
    html = html.split(absolute).join(target);
  }
  return html;
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
    // #11：类型标记写进 data-type，统计代码读它而不是猜 class（改样式不断统计）；自定义按钮 type=custom
    const dtype = matched ? (matched.type || (matched.cls === 'mrhx-btn-m' ? 'mobile' : matched.cls === 'mrhx-btn-b' ? 'baidu' : 'custom')) : 'custom';
    return `<a class="${cls}" data-type="${dtype}" href="${esc(l.url)}" target="_blank" rel="noreferrer">${name}</a>`;
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
${NAV_CSS}
@media (max-width:720px){.sect{gap:6px}.dyx-btn{padding:4px 11px;font-size:11px;margin-left:6px}}
</style>
${SITE_ICON_TAGS}
</head>
<body>
<header>
${navHeaderHtml('')}
</header>
<main>
  <p>暂无分享，敬请期待</p>
</main>
<script src="assets/js/nav.js?v=${NAVJS_VER}"></script>
${SMOOTH_SCRIPTS}
<footer>${SITE_FOOTER}</footer>
${popupHtml}
${topButton}
${SITE.comments.enabled && SITE.comments.url && SITE.comments.anonKey ? viewScript(SITE.comments.url.replace(/\/+$/, ''), SITE.comments.anonKey, '/index.html') : ''}
</body>
</html>
`;
}

function verify(days, index, searchIndex) {
  const errors = [];
  for (const d of days) {
    // skip qzt.html and jinri.html from normal day-page checks (different structure)
    const isQzt = d.file === 'qzt.html';
    const isJinri = d.file === 'jinri.html';
    const ref = `href="${esc(path.basename(d.file))}"`;
    if (!index.includes(ref)) errors.push(`首页缺少帖子链接: ${d.file}`);
    const h = fs.readFileSync(d.file, 'utf8');
    // 正文节点校验：按游戏节点（heading3）数判断，不能用 '<li class="node"' 子串（带属性的节点不匹配）
    if ((isQzt || isJinri) ? false : Number(d.gameCount) > 0 && !/class="node heading3/.test(h)) errors.push(`帖子正文缺失游戏节点: ${d.file}`);
    if (Number(d.gameCount) > 0 && !index.includes(`共 ${d.gameCount} 款游戏`)) errors.push(`首页游戏数与实际不符: ${d.file} (${d.gameCount})`);
    const disp = TITLES[path.parse(d.file).name] || path.parse(d.file).name;
    const titleOk = h.includes(`<title>${esc(disp)} · ${esc(SITE_NAME)}</title>`);
    const h1Ok = h.includes(`>${esc(disp)}</div>`);
    if (!titleOk && !h1Ok) errors.push(`帖子标题未同步: ${d.file} (期望 ${disp})`);
    if ((isQzt || isJinri) ? false : SITE.comments.enabled && !h.includes('<!--mrhx-comments-->')) errors.push(`评论区注入缺失: ${d.file}`);
    // #9：qzt/jinri 不再跳过浏览量注入检查；#12 后帖子页改为引用公共 track 脚本
    if ((isQzt || isJinri) ? false : SITE.comments.enabled && !h.includes('inc_page_view') && !h.includes('assets/js/track.js')) errors.push(`浏览量脚本注入缺失: ${d.file}`);
    [...h.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].forEach(m => {
      const t = m[1].replace(/<[^>]+>/g, '').trim();
      if (/(?:PC\s*\+\s*安卓|PC|安卓){2,}/.test(t)) errors.push(`标题含重复平台标记: ${d.file} → ${t}`);
    });
    [...h.matchAll(/(?:href|src)="([^"]+)"/g)].forEach(m => {
      const u = m[1];
      if (/javascript:/i.test(u) || /[\s"'<>]/.test(u)) errors.push(`非法链接格式: ${d.file} → ${u}`);
    });
  }

  // #9（2026-09-09 事故教训）：全部游戏页/今日页不再跳过数量校验，不足下限直接报错终止发布
  const qzt = days.find(d => d.file === 'qzt.html');
  const QZT_MIN = 72; // 2026-09-09 事故后定的下限：丢到 66 款时必须拦截
  if (!qzt) {
    errors.push('qzt.html 未进入生成结果（全部游戏页丢失？）');
  } else if (Number(qzt.gameCount) < QZT_MIN) {
    errors.push(`qzt.html 游戏数 ${qzt.gameCount} 低于下限 ${QZT_MIN}（疑似节点丢失，禁止发布）`);
  }
  // jinri.html 不经 gen.js 生成（files 已排除），做文件级完整性校验
  if (!fs.existsSync('jinri.html')) {
    errors.push('jinri.html 文件丢失（今日页）');
  } else if (!fs.readFileSync('jinri.html', 'utf8').includes('今日合集')) {
    errors.push('jinri.html 内容异常（缺少「今日合集」标记）');
  }

  // #10：搜索索引每条必须有非空 url 且指向的帖子文件存在，否则点击搜索结果 404
  const noUrl = searchIndex.filter(g => !g.url);
  if (noUrl.length) errors.push(`search_index.json 有 ${noUrl.length} 条缺少 url，如：${noUrl[0].title}`);
  const urlFiles = new Set(searchIndex.filter(g => g.url).map(g => g.url));
  for (const u of urlFiles) {
    if (!fs.existsSync(u)) errors.push(`search_index.json 的 url 指向不存在的文件: ${u}`);
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
  const assetsRoot = path.resolve(assetsDir);
  if (!fs.existsSync(assetsDir)) return;
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // 路径穿越防护：basename 白名单
    const safeEntry = path.basename(entry.name);
    if (!safeEntry || safeEntry.includes('..')) continue;
    const subDirAbs = path.resolve(assetsRoot, safeEntry);
    if (subDirAbs.indexOf(assetsRoot + path.sep) !== 0) continue;
    const files = fs.readdirSync(subDirAbs);
    for (const file of files) {
      // 路径穿越防护：basename 白名单
      const safeFile = path.basename(file);
      if (!safeFile || safeFile.includes('..')) continue;
      const ext = path.extname(safeFile).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext)) continue;
      const srcPath = path.resolve(subDirAbs, safeFile);
      const dstName = path.parse(safeFile).name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const dstPath = path.resolve(subDirAbs, dstName + '.webp');
      // SECURITY: 边界校验——目标路径相对 assetsRoot 必须落在子树内（startsWith('../' 或以 .. 开  均拦截）
      const srcRel = path.relative(assetsRoot, srcPath);
      const dstRel = path.relative(assetsRoot, dstPath);
      if (srcRel.startsWith('..') || path.isAbsolute(srcRel)) continue;
      if (dstRel.startsWith('..') || path.isAbsolute(dstRel)) continue;
      if (fs.existsSync(dstPath) && fs.statSync(dstPath).mtime >= fs.statSync(srcPath).mtime) continue;
      try {
        const buf = fs.readFileSync(srcPath);
        const compressed = await sharp(buf)
          .webp({ quality: 50, alphaQuality: 100, lossless: false })
          .toBuffer();
        fs.writeFileSync(dstPath, compressed);
        console.log('  compress', safeEntry, safeFile, `-> ${dstName}.webp (${(buf.length/1024).toFixed(0)}KB -> ${(compressed.length/1024).toFixed(0)}KB)`);
      } catch (e) {
        console.warn('  compress failed:', srcPath, e.message);
      }
    }
  }
}

async function cleanupMarkedRawImages() {
  const assetsRoot = path.resolve('assets');
  if (!fs.existsSync(assetsRoot)) return;
  const checkFiles = fs.readdirSync(POST_DIR).filter(file => /\.(?:html|json|xml|txt|md|css|js|svg)$/i.test(file) && !EXCLUDE.has(file));
  const pages = checkFiles.map(file => fs.readFileSync(path.join(POST_DIR, file), 'utf8'));
  for (const entry of fs.readdirSync(assetsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[\u4e00-\u9fa5\w.-]+$/.test(entry.name)) continue;
    const dir = safeAssetDir(entry.name);
    for (const marker of fs.readdirSync(dir).filter(file => file.endsWith('.mrhx-delete-after-webp'))) {
      const sourceName = marker.slice(0, -'.mrhx-delete-after-webp'.length);
      if (path.basename(sourceName) !== sourceName || !/^[a-zA-Z0-9_-]+\.(?:png|jpe?g|gif|bmp|tiff)$/i.test(sourceName)) continue;
      const sourcePath = path.resolve(dir, sourceName);
      const webpPath = path.resolve(dir, path.parse(sourceName).name + '.webp');
      const sourceRef = `assets/${entry.name}/${sourceName}`;
      const webpRef = `assets/${entry.name}/${path.parse(sourceName).name}.webp`;
      const sourceUsed = pages.some(page => page.includes(sourceRef));
      const webpUsed = pages.some(page => page.includes(webpRef));
      if (!fs.existsSync(sourcePath) || !fs.existsSync(webpPath) || sourceUsed || !webpUsed) {
        console.warn('  kept marked source; WebP/page checks not satisfied:', entry.name, sourceName);
        continue;
      }
      try {
        const info = await sharp(fs.readFileSync(webpPath)).metadata();
        if (info.format !== 'webp') {
          console.warn('  kept marked source; target is not WebP:', entry.name, sourceName);
          continue;
        }
        const rawUploadMarker = sourcePath + '.mrhx-new-upload';
        if (fs.existsSync(rawUploadMarker)) {
          fs.writeFileSync(webpPath + '.mrhx-new-upload', fs.readFileSync(rawUploadMarker));
          fs.unlinkSync(rawUploadMarker);
        }
        fs.unlinkSync(sourcePath);
        fs.unlinkSync(path.join(dir, marker));
        console.log('  cleaned marked source after WebP is referenced:', entry.name, sourceName);
      } catch (error) {
        console.warn('  kept marked source; WebP validation failed:', sourceName, error.message);
      }
    }
  }
}

// （已撤销 #14 缩略图生成：站长要求图片恢复直连原图；t_ 文件已从仓库删除）
async function makeThumb() { return false; }

let HIDDEN = {};
if (fs.existsSync('hidden.json')) {
  try { HIDDEN = readJson('hidden.json'); } catch (e) { console.warn('hidden.json 解析失败，忽略'); }
}

const days = [];
const searchIndex = [];
const allGames = [];

// qzt.html 求助贴分页（2026-10-01 用户定稿：一页 50 条，替代此前的折叠方案）。
// 单文件 JS 分页：卡片全在页面里（SEO/搜索索引不受影响），脚本按每 50 张一组切换显示；
// 非当前页的 img 把 src 暂存 data-src 并清空，翻到才加载（display:none 挡不住非 lazy img 发请求，必须清 src）。
// 幂等：页码栏与样式脚本都用注释标记先删后插；DOM 不包壳，reorderNodes 输入输出无痕。
const QZT_MORE_COUNT = 60;
function qztUnwrapPager(html) {
  // 兼容清理：2026-10-01 短暂上线过的折叠壳（横幅 + hidden 容器），剥掉还原成纯净卡片流
  html = html.replace(/<div class="qzt-fold-box">[\s\S]*?<\/div>\s*/g, '');
  html = html.replace(/<div id="qzt-fold-zone" hidden>\s*/g, '');
  html = html.replace(/\n\s*<\/div>\s*<!--\/qzt-fold-->\s*/g, '');
  html = html.replace(/<!--qzt-fold-assets-->[\s\S]*?<!--\/qzt-fold-assets-->\s*/g, '');
  // 分页壳剥除（先删后插）
  html = html.replace(/<!--qzt-pager-->[\s\S]*?<!--\/qzt-pager-->\s*/g, '');
  html = html.replace(/<!--qzt-page-assets-->[\s\S]*?<!--\/qzt-page-assets-->\s*/g, '');
  // defer 变体归一化（2026-10-09）：上次运行 qztDeferImages 写出的 hidden 变体卡，
  // reorder 按 '<li class="node heading3">' 精确认卡，变体会被处理链毁掉（曾丢 145 卡）。
  // 必须在 reorder 前还原成标准开标签；图片的 data-src 留给 qztDeferImages 按新顺序双向归位。
  html = html.split('<li hidden class="node heading3">').join('<li class="node heading3">');
  html = html.split('<li class="node heading3" hidden>').join('<li class="node heading3">');
  return html;
}
function qztInjectPager(html) {
  // 先删掉上次注入的分页栏副本（幂等——否则每次跑生成器都追加一条，2026-10-03 曾堆到 3 条）
  html = html.replace(/<!--qzt-pager-->[\s\S]*?<!--\/qzt-pager-->\s*/g, '');
  const end = html.lastIndexOf('</ul>');
  if (end < 0) return html;
  return html.slice(0, end + 5)
    + '\n  <!--qzt-pager--><div class="qzt-more" id="qztMore" hidden><button type="button" id="qztMoreBtn">显示更多</button><span class="qzt-more-info" id="qztMoreInfo"></span></div><!--/qzt-pager-->'
    + html.slice(end + 5);
}
function qztDeferImages(s) {
  // 生成期真·延迟加载：第 60 张卡之后的 img 不写 src（写 data-src），li 加 hidden——
  // 浏览器解析 HTML 时就不会发起这 144 个图片请求（此前只在浏览器端摘 src，
  // 为时已晚，206 张图并发把用户网络打爆，前 60 张也转圈——2026-10-09 用户实测踩坑）。
  // ⚠️ 入参是 node-list 的 inner（以第一张卡开头），split 后 parts[0] = 卡 0，parts[i] = 卡 i
  return s.split(/(?=<li class="node heading3)/).map(function (p, i) {
    if (i < QZT_MORE_COUNT) {
      // 前 60 卡反向还原：上轮被 defer 的卡若因新帖插入排进前 60，必须拿回真 src
      return p.replace(/(<img\b[^>]*?)\sdata-src="([^"]*)"/g, '$1 src="$2"');
    }
    return p
      .replace(/(<img\b[^>]*?)\ssrc="([^"]*)"/g, '$1 data-src="$2"')
      // hidden 必须插在 class 之后——gen.js 守卫与搜索索引都按 '<li class="node heading3' 前缀数卡，
      // 写成 '<li hidden class=...' 会让统计掉到 61 触发发布自检（2026-10-09 踩坑）
      .replace(/<li class="node heading3">/, '<li class="node heading3" hidden>');
  }).join('');
}
const QZT_PAGE_ASSETS = `<style>
.qzt-more{margin:26px 0 10px;text-align:center}
.qzt-more button{display:inline-block;padding:11px 34px;border:1px solid #e5484d;border-radius:999px;background:#fff;color:#e5484d;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;transition:.2s}
.qzt-more button:hover{background:#e5484d;color:#fff}
.qzt-more-info{display:block;margin-top:8px;font-size:12px;color:#b8b2aa}
.qzt-modal-mask{position:fixed;inset:0;z-index:9999;background:rgba(43,43,43,.45);display:none;align-items:center;justify-content:center;padding:20px}
.qzt-modal-mask.show{display:flex}
.qzt-modal{background:#fff;border-radius:16px;max-width:380px;width:100%;padding:24px 22px;box-shadow:0 20px 60px rgba(0,0,0,.25);text-align:center}
.qzt-modal p{font-size:14px;color:#444;line-height:1.8;margin-bottom:18px}
.qzt-modal .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.qzt-modal button{padding:10px 20px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid #e2ded8;background:#fff;color:#666}
.qzt-modal button.pri{background:#e5484d;color:#fff;border-color:#e5484d}
.qzt-modal button:hover{opacity:.9}
</style>
<script>
document.addEventListener('DOMContentLoaded',function(){
  var ul=document.querySelector('ul.node-list'); if(!ul) return;
  var lis=Array.prototype.slice.call(ul.children).filter(function(el){return el.tagName==='LI';});
  var FIRST=${QZT_MORE_COUNT}; if(lis.length<=FIRST) return;
  var box=document.getElementById('qztMore'); if(!box) return;
  var info=document.getElementById('qztMoreInfo');
  var shown=FIRST;
  function fill(li){
    li.removeAttribute('hidden');
    Array.prototype.forEach.call(li.querySelectorAll('img'),function(im){
      if(!im.getAttribute('src') && im.getAttribute('data-src')){ im.src=im.getAttribute('data-src'); im.removeAttribute('data-src'); }
    });
  }
  function refresh(){
    if(info) info.textContent='已显示 '+shown+' 款 · 共 '+lis.length+' 款游戏';
    if(shown>=lis.length) box.style.display='none';
  }
  function showBatch(){
    var end=Math.min(shown+FIRST,lis.length);
    for(var j=shown;j<end;j++) fill(lis[j]);
    shown=end; refresh();
  }
  function showAll(){
    lis.forEach(fill);
    shown=lis.length; refresh();
  }
  box.removeAttribute('hidden');
  refresh();
  // 旧分页链接兼容：#p2 这类页码直达 → 直接显示全部
  if(/p\\d+/.test(location.hash) && parseInt((location.hash.match(/p(\\d+)/)||[])[1],10)>1) showAll();
  var btn=document.getElementById('qztMoreBtn');
  if(btn) btn.addEventListener('click',function(){
    var mask=document.getElementById('qztModal');
    if(mask) mask.classList.add('show');
  });
  var mask=document.createElement('div');
  mask.className='qzt-modal-mask'; mask.id='qztModal';
  mask.innerHTML='<div class="qzt-modal"><p>还有 '+(lis.length-shown)+' 款游戏未显示。<br>要继续怎么显示？</p><div class="row"><button type="button" id="qztCancel">先不加了</button><button type="button" id="qztBatch">再显示 '+FIRST+' 款</button><button type="button" class="pri" id="qztAll">显示全部 '+lis.length+' 款</button></div></div>';
  document.body.appendChild(mask);
  mask.addEventListener('click',function(e){ if(e.target===mask) mask.classList.remove('show'); });
  document.getElementById('qztCancel').addEventListener('click',function(){ mask.classList.remove('show'); });
  document.getElementById('qztBatch').addEventListener('click',function(){ mask.classList.remove('show'); showBatch(); });
  document.getElementById('qztAll').addEventListener('click',function(){ mask.classList.remove('show'); showAll(); });
});
</script>`;

// 后台搜索用的「帖子级别」索引：key=短文件名（如 "8.10"），value={title,games,intro}
const gameIndex = {};
(async () => {
    await compressExistingAssets();

for (const file of files) {
    let     html = fs.readFileSync(POST_DIR + '/' + file, 'utf8');
    const computed = (html.match(/<li class="node[^"]*heading/g) || []).length;
    const tag = dayTag(file);
    const gameCount = overrides[tag] !== undefined ? overrides[tag] : computed;

    // 图床域名归一化：后台发布器用的地址存在浏览器 localStorage，浏览器没更新时新帖会继续产出旧域名直链，
    // 直连旧域名会绕过 CF 缓存消耗 KV 额度。生成时统一改写为 site.json 的 baseUrl（2026-09-27 加）。
    if (SITE.imgbed && SITE.imgbed.baseUrl) {
      const _curBase = String(SITE.imgbed.baseUrl).replace(/\/+$/, '');
      for (const _b of IMGBED_BASES) {
        if (_b === _curBase) continue;
        html = html.split(_b + '/file/').join(_curBase + '/file/');
      }
    }

    html = await localize(html, tag);
    // 图床兜底：给图床直链加 onerror，图床挂了自动换 GitHub 备份图
    html = injectJsdelivrFallback(html);

    // 图床图直换 GitHub(jsDelivr) 备份源（2026-09-27 用户要求）：有备份映射的图床直链直接改写为 jsDelivr，
    // 彻底不耗图床 KV 额度；无备份的图保持原样（继续走图床 + onerror 兜底）。
    // 注意必须放在 localize 之后：localize 会把 assets/<目录>/ 重写为本帖 tag 目录（第 683 行），
    // 若替换在前，生成的 assets/imgbed/ 会被改写成 assets/<tag>/ 导致 404（2026-09-27 踩过）。
    if (Object.keys(IMGBED_MAP).length) {
      html = html.replace(
        /(<img\b[^>]*?\bsrc=")https:\/\/[^"]*?\/file\/([^"?]+\.[A-Za-z0-9]+)("[^>]*?>)/g,
        (m, pre, fname, post) => {
          const local = IMGBED_MAP[fname] || IMGBED_MAP[fname.split('/').pop()];
          return local ? `${pre}${CDN_URL}/assets/imgbed/${local}${post}` : m;
        }
      );
      // 自愈：修复历史坏产物。2026-09-27 替换时序 bug 曾把 assets/imgbed/<hash>.webp 重写成
      // assets/<tag>/<hash>.webp（404），且 URL 已不含 /file/、上面的正则匹配不到，坏产物被固化。
      // 识别「路径不是 assets/imgbed/ 但文件名是备份去重名」的引用，改回正确路径。
      const _validImgbed = new Set(Object.values(IMGBED_MAP));
      // 不限定 src= 前缀：坏引用还出现在 meta og:image content、JSON-LD "image"、onerror 单引号 URL、多行 img 里
      html = html.replace(
        /(https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^\/'"\s]+\/)assets\/(?!imgbed\/|js\/|css\/)(?:[^"'\/\s)]+\/)?([^"'\/\s)]+\.webp)/g,
        (m, host, fname) =>
          _validImgbed.has(fname) ? `${host}assets/imgbed/${fname}` : m
      );
    }

    // update local asset refs to .webp if exists
    const tagDir = safeAssetDir(tag);
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


    const iconRe = /(?:<link rel="icon"[^>]*>\s*<link rel="apple-touch-icon"[^>]*>\s*)+/g;    html = html.replace(iconRe, (m) => {
      const first = m.match(/<link rel="icon"[^>]*>/);
      const second = m.match(/<link rel="apple-touch-icon"[^>]*>/);
      return first && second ? `${first[0]}\n${second[0]}\n` : m;
    });
    // 锚点清除（本次改造后新格式）
    html = html.replace(/<!--view-track-->[\s\S]*?<!--view-track-end-->\s*/g, '');
    // legacy 清除：历史文件里无锚点的旧注入（含 2026825 等重复注入帖子的第二段），全部移除后统一重注入
    html = html.replace(/<script>\s*\(function \(\) \{\s*try \{[\s\S]*?inc_page_view[\s\S]*?<\/script>\s*/g, '');

    html = html.replace(/\n\s*<li class="node">[\s\S]*?<\/li>/g, '');

    // 修复：若下载按钮被误嵌套在 note 内部（幕布粘贴/手改常见），提取到 note 之后同层。
    //   嵌套时 grid2 卡片 CSS 的行截断会把按钮裁掉，表现为“按钮被隐藏，点图片展开才出现”。
    //   正则兼容幕布节点的 data-page-node-id 属性；note 内部若另有 </div> 则不动，避免误伤嵌套结构
    html = html.replace(/<div class="note mm-editor"[^>]*>((?:(?!<\/div>)[\s\S])*?)<div class="mrhx-dl"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g,
      (m, noteInner, dlInner) => `<div class="note mm-editor">${noteInner}</div>\n    <div class="mrhx-dl">${dlInner}</div>`);

    html = html.replace(/<div class="note mm-editor">([\s\S]*?)<\/div>/g,
      (m, inner) => {
        if (/<a class="mrhx-btn mrhx-btn-[a-z-]+"/.test(inner)) return m;
        if (/content-link/.test(inner) || inner.includes('mrhx-dl')) return '<div class="note mm-editor">' + rebuildNote(inner) + '</div>';
        return m;
      });

    html = html.replace(/<a class="mrhx-btn-([a-z-]+)"/g, '<a class="mrhx-btn mrhx-btn-$1"');

    // #11：给已存在的下载按钮补 data-type（历史页面因幂等保护跳过 rebuildNote，按钮不会重建，
    //   故单独补标；nav 导航按钮不属于下载统计，跳过）
    html = html.replace(/<a class="mrhx-btn (mrhx-btn-[a-z-]+)"((?:(?!data-type=)[^>])*)>/g, (m, cls, rest) => {
      if (cls === 'mrhx-btn-nav') return m;
      const t = cls === 'mrhx-btn-m' ? 'mobile' : cls === 'mrhx-btn-b' ? 'baidu' : 'custom';
      return `<a class="mrhx-btn ${cls}" data-type="${t}"${rest}>`;
    });

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
      // 公告卡（标题「求助公告」，2026-10-07 由「免费帮找游戏（纯公益）」改名而来）：
      // 标题含下面任一关键词即判定为公告卡，加 node-full 让它横跨整行。
      // ⚠️ 改名后一度只认「免费帮找」，导致 node-full 丢失（间距样式失效、
      // 「求助公告」被当成一个游戏写进 SEO/搜索索引）。两个词都保留做兼容。
      if (contentBlock && (contentBlock.indexOf('求助公告') > -1 || contentBlock.indexOf('免费帮找') > -1)) {
        open = open.replace(/<li class="node heading3">/, '<li class="node heading3 node-full">');
      }
      return open + contentBlock + (imgBlock ? '\n    ' + imgBlock : '') + (dlBlock ? '\n    ' + dlBlock : '') + (noteBlock ? '\n    ' + noteBlock : '') + '\n  </li>';
    });
    blocks = blocks.filter(b => b.trim().length > 0);
    let qztInner = blocks.join('');
    if (file === 'qzt.html') qztInner = qztDeferImages(qztInner);
    return prefix + '<ul class="node-list">\n' + qztInner + '\n  </ul>' + suffix;
  })(file === 'qzt.html' ? qztUnwrapPager(html) : html);

    // qzt.html：卡片壳已剥净，此处注入页码栏（DOM 不包壳，reorder 无痕）
    if (file === 'qzt.html') html = qztInjectPager(html);

    html = html.replace(PUBLISH_RE, newPublish);

    // #51：官网/全部黄油/解压教程不再以卡片形式塞进游戏列表，改放到底部「上一期/下一期」行中间（见第二遍 daynav 注入）

    const bar = `<header>
${navHeaderHtml('')}
</header>`;
    const injected = `<!--mrhx-->\n<link rel="stylesheet" href="assets/css/site.css?v=${CSS_VER}">\n<script>document.addEventListener('DOMContentLoaded',function(){var imgs=document.querySelectorAll('img.image');for(var i=0;i<imgs.length;i++){if(!imgs[i].complete){imgs[i].classList.add('mrhx-img-loading');imgs[i].addEventListener('load',function(){this.classList.remove('mrhx-img-loading')});imgs[i].addEventListener('error',function(){this.classList.remove('mrhx-img-loading')})}}});</script>\n${bar}\n<script src="assets/js/nav.js?v=${NAVJS_VER}"></script>\n${SMOOTH_SCRIPTS}\n<!--mrhx-end-->`;
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
    // 帖子页：图标声明全站统一 —— 先把页里所有历史图标声明清掉（本地 favicon.jpg、
    //   旧 CDN 的 favicon.webp / ac9ce9ba / 65ce…），再在 </head> 前注入图床版的一对。
    //   先删后插是幂等的：重复运行结果一致，也不会出现两份图标。
    html = html.replace(ICON_TAG_RE, '');
    html = html.replace('</head>', `${SITE_ICON_TAGS}\n</head>`);
    // 清掉旧的 SEO 块时把它的换行一起吃掉：否则每生成一次就多留一个空行，
    // 长期跑会让帖子页头部空行无限增长（图标块紧跟在它后面，表现最明显）
    html = html.replace(/<!--mrhx-seo-->[\s\S]*?<!--\/mrhx-seo-->\r?\n?/g, '');
    // #24/#25：帖子页 SEO 注入延后到 games 解析之后（见本循环末尾）

    const v = SITE.comments;
    let commentBlock = '';
    if (v.enabled && v.url && v.anonKey) {
      const sb = esc(v.url.replace(/\/+$/, ''));
      const key = esc(v.anonKey);
      // 密钥迁移：notifySecret 不再下发到网页（以前每个访客查看源码都能看到）。
      //   新评论/回复通知改由 Supabase 数据库触发器 → GitHub Actions 完成（supabase/upgrade_notify_comment.sql + upgrade_reply_notify.sql）
      // #39：折叠阈值从 site.json 读（comments.foldThreshold，默认 6），随 MRHXC 配置下发给公共评论脚本
      const fold = Number(v.foldThreshold) > 0 ? Number(v.foldThreshold) : 6;
      commentBlock = `<!--mrhx-comments-->\n<script>window.MRHXC={sb:'${sb}',key:'${key}',path:'/${esc(shortName)}.html',fold:${fold}};</script>\n<script src="assets/js/comments.js"></script>\n<!--mrhx-comments-end-->`;
    }
    html = html.replace(/<!--mrhx-comments-->[\s\S]*?<!--mrhx-comments-end-->\s*/g, '');
    html = html.replace(/<button[^>]*class="mrhx-top"[^>]*>[\s\S]*?<\/script>\s*/g, '');
    html = html.replace(/<!--view-track-->[\s\S]*?<!--view-track-end-->\s*/g, '');
    html = html.replace(/<script>\s*\(function \(\) \{\s*try \{[\s\S]*?inc_page_view[\s\S]*?<\/script>\s*/g, '');
    const topBtn = topButton;
    const vb = (v.enabled && v.url && v.anonKey) ? viewScript(v.url.replace(/\/+$/, ''), v.anonKey, '/' + shortName + '.html') : '';
    const staggerBlock = html.includes('<!--mrhx-stagger-->') ? '' : `\n  <!--mrhx-stagger--><style>\n${staggered}\n</style>`;
    html = html.replace(/<!--mrhx-expand-->[\s\S]*?<\/script>\s*/g, '');
    html = html.replace(/<script>\s*\(function\(\)\{\s*var SB=[\s\S]*?download_clicks[\s\S]*?\}\)\(\);\s*<\/script>/g, '');
    html = html.replace(/<script src="assets\/js\/cdn-fallback\.js" defer><\/script>\s*/g, '');
    // 帖子页/qzt 不加任何 footer（保持加免责声明之前的原样）——但要清掉历史注入的副本
    html = html.replace(/<footer class="mrhx-foot">[\s\S]*?<\/footer>\s*/g, '');
    html = html.replace('</body>', `  ${topBtn}${commentBlock ? '\n  ' + commentBlock : ''}${vb ? '\n  ' + vb : ''}${staggerBlock}${nodeExpandScript}\n  </body>`);

    // 历史遗留：分页块曾被注入到全站所有帖子（非 qzt 是脏数据）。
    // 需求（站长 2026-10-07）：分页只针对求助贴 qzt.html，其他帖子一律清掉分页栏与分页资源。
    // 只删这两段标记块，卡片 HTML 一字不动 —— 不碰名字、链接、图片、顺序。
    // 幂等：qztInjectPager/qztUnwrapPager 同样「先删后插」，连跑两次结果一致。
    if (file !== 'qzt.html') {
      html = html.replace(/<!--qzt-pager-->[\s\S]*?<!--\/qzt-pager-->\s*/g, '');
      html = html.replace(/<!--qzt-page-assets-->[\s\S]*?<!--\/qzt-page-assets-->\s*/g, '');
    }
    // qzt 分页样式与脚本（只注入 qzt 页；先删后插保证幂等，同图标/SEO 模式）
    if (file === 'qzt.html') {
      html = html.replace(/<!--qzt-page-assets-->[\s\S]*?<!--\/qzt-page-assets-->\s*/g, '');
      html = html.replace('</body>', `  <!--qzt-page-assets-->${QZT_PAGE_ASSETS}<!--/qzt-page-assets-->\n  </body>`);
    }

    const searchBlocks = [];
    let pos = 0;
    // 兼容带 data-page-node-id 属性的节点（qzt 等幕布原始结构），否则这些帖子的游戏全部进不了搜索索引
    const nodeOpenRe = /<li class="node heading3"[^>]*>/g;
    while (pos < html.length) {
      nodeOpenRe.lastIndex = pos;
      const mm = nodeOpenRe.exec(html);
      if (!mm) break;
      const h3 = mm.index;
      let depth = 0, i = h3;
      while (i < html.length) {
        if (html.indexOf('<li', i) === i) depth++;
        if (html.indexOf('</li>', i) === i) { depth--; if (depth === 0) { searchBlocks.push(html.slice(h3, i + 5)); pos = i + 5; break; } i += 5; continue; }
        i++;
      }
      if (i >= html.length) { searchBlocks.push(html.slice(h3)); break; }
    }
    const games = searchBlocks.map(b => {
      const title = ((b.match(/<div class="content mm-editor"[^>]*><span[^>]*>([\s\S]*?)<\/span><\/div>/) || [])[1] || '').replace(/<em class="mrhx-plat"[^>]*>[^<]*<\/em>/g, '').replace(/<[^>]+>/g, '').trim();
      const intro = (b.match(/<div class="note mm-editor"[^>]*><span[^>]*>([\s\S]*?)<\/span><\/div>/) || [])[1] || '';
      const img0 = (b.match(/src="([^"]+)"/) || [])[1] || '';
      // 历史页面可能残留 t_ 缩略图引用（#14 已撤销），统一还原原图
      const img = img0.replace(/\/t_([^/"?]+\.webp)$/, '/$1');
      const plat = (b.match(/<em class="mrhx-plat"[^>]*>([^<]*)<\/em>/) || [])[1] || '';
      const links = [...b.matchAll(/<a class="mrhx-btn[^"]*"[^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)].map(m => ({ url: m[1], label: m[2].replace(/[：:]\s*$/, '') }));
      // #10：帖子级 url（搜索结果标题跳转用）。缺失会导致点击结果 404/空链接
      return { title, intro, img, links, plat, url: file, source: TITLES[shortName] || shortName };
    }).filter(g => g.title);
    searchIndex.push(...games);
    allGames.push(...games.map(g => ({ ...g, file })));

    // #24/#25：分享卡用本期首游戏封面（无封面回退 logo）；description 拼本期游戏名
    const firstImg = (games.map(g => g.img).filter(Boolean)[0]) || '';
    const seoNames = games.map(g => g.title).filter(Boolean);
    const dayDesc = seoNames.length
      ? `本期分享（${dispTitle}）：` + seoNames.slice(0, 8).join('、') + (seoNames.length > 8 ? ` 等 ${seoNames.length} 款` : '') + '。PC+安卓黄油游戏，移动云盘与百度网盘直达下载。'
      : SEO_DESCRIPTION;
    html = html.replace('</head>', `<!--mrhx-seo-->${seoHead(shortName + '.html', dispTitle, { desc: dayDesc, ogImg: firstImg || (CDN_URL + '/logo.webp') })}<!--/mrhx-seo-->\n</head>`);

    // #26：JSON-LD 结构化数据（BlogPosting + 本期游戏列表），帮助搜索引擎理解页面内容
    {
      const tsLd = TIMESTAMPS[shortName] ? new Date(TIMESTAMPS[shortName]).toISOString() : null;
      const ld = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: dispTitle,
        description: dayDesc,
        url: SITE_URL + file,
        isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL },
        author: { '@type': 'Organization', name: SITE_AUTHOR },
        about: games.slice(0, 30).map(g => ({ '@type': 'VideoGame', name: g.title }))
      };
      if (firstImg) ld.image = firstImg;
      if (tsLd) { ld.datePublished = tsLd; ld.dateModified = tsLd; }
      // </script> 防注入：把 < 转义，JSON 内容不受影响
      html = html.replace('<!--/mrhx-seo-->', '<script type="application/ld+json">' + JSON.stringify(ld).replace(/</g, '\\u003c') + '</script>\n<!--/mrhx-seo-->');
    }

    // #30：标题后挂浏览量占位（真实数字由 track.js 从 page_views 拉取；先清旧占位保证幂等）
    html = html.replace(/<span class="mrhx-views"[^>]*><\/span>/g, '');
    html = html.replace(/<div class="title">([^<]*)<\/div>/, '<div class="title">$1<span class="mrhx-views" id="mrhx-views"></span></div>');

    // 给后台搜索用的「帖子级别」索引：每期帖子的标题 + 所有游戏名 + 帖子正文 intro
    if (!gameIndex[shortName]) {
      const postIntro = (html.match(/<div class="note mm-editor"[^>]*><span[^>]*>([\s\S]*?)<\/span><\/div>/) || [])[1] || '';
      gameIndex[shortName] = {
        title: TITLES[shortName] || shortName,
        games: games.map(g => g.title).filter(Boolean),
        intro: postIntro.replace(/<[^>]+>/g, '').trim()
      };
    }

    // （已撤销 #14 缩略图：站长要求图片全部恢复直连原图，不用 t_ 加速层）
    // 源文件里可能残留历史 t_ 引用，统一还原成原图（幂等）
    html = html.replace(/(src="https:\/\/[^"]*\/assets\/[^"]*?)\/t_([^/"]+\.webp")/g, '$1/$2');

    fs.writeFileSync(POST_DIR + '/' + file, html);
    console.log('day page ok:', POST_DIR + '/' + file, '(' + gameCount + ' 款游戏)');
    if (HIDDEN[shortName]) console.log('  (hidden, skipped in index)');
    // #24：记录每期首游戏封面，供首页分享卡取「最后一期（首页首位）」的封面
    else days.push({ file: file, gameCount, tag, cover: firstImg || '' });
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
    // 平台标签按「显示标题」判断（标题含"安卓"即 PC+安卓）；用文件名判断是错的——pcaz 里恰好含 "pc"、永远不含"安卓"（2026-10-01 用户反馈全显示 PC）
    const plat = /安卓/.test(disp) ? 'PC+安卓' : /PC/i.test(disp) ? 'PC' : '';
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
    // 封面来源：站内 assets（jsDelivr 直链）+ 自建图床直链（图床模式发布的帖子）
    // 注意：导航 logo 也是图床直链，必须排除，否则会混进每帖的封面缩略图（2026-09-22 踩过）
    const _bedRe = [...IMGBED_BASES].map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const covers = [...new Set([...dayHtml.matchAll(new RegExp('src="(https:\\/\\/(?:cdn|gcore|fastly|testingcf)\\.jsdelivr\\.net\\/gh\\/TKPORL\\/mrhyfx@[^\\/]+\\/assets\\/[^"]+|https:\\/\\/tkporl\\.github\\.io\\/mrhyfx\\/assets\\/[^"]+|(?:' + _bedRe + ')\\/[^"]+)', 'g'))].map(m => m[1]))]
      .filter(src => src !== SITE_LOGO_IMG && src !== SITE_ICON_IMG).slice(0, 5)
      .map(src => `<img src="${src}" alt="${esc(disp)}" loading="lazy">`).join('');
    const _pfile = path.basename(d.file);
    // 修复：分页后每页卡片重新触发入场动画，旧逻辑按全局序号递增延迟（第2页延迟长达 2.4s，看起来像空页）；
    //   改为按页内序号（每页最多 24 张），延迟封顶 1 秒内
    return `<a class="post" href="${_pfile}" data-path="/${_pfile}" style="animation-delay:${((di % 24) * 0.04).toFixed(2)}s">
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
${seoHead('', null, { ogImg: (days[0] && days[0].cover) || (CDN_URL + '/logo.webp') })}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
${NAV_CSS}
@keyframes mrhxDrop{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:none}}
@keyframes mrhxCard{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
main{max-width:900px;margin:0 auto;padding:28px 20px 44px}
.upd{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #f2e2e2;border-left:4px solid #e5484d;border-radius:12px;padding:14px 18px;margin-bottom:26px;font-size:14px;color:#666;box-shadow:0 1px 3px rgba(0,0,0,.04);animation:mrhxCard .5s ease both;flex-wrap:wrap}
.upd b{color:#e5484d}
.upd .tag{background:#fdf1f1;color:#e5484d;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600}
  .upd-note{font-size:12.5px;color:#999;margin:-14px 0 16px;padding-left:4px;line-height:1.7}
  .dyx-btn{display:inline-flex;align-items:center;padding:5px 14px;border-radius:99px;background:#e5484d;color:#fff;font-size:12px;font-weight:600;text-decoration:none;transition:.2s;white-space:nowrap;margin-left:8px}
  .dyx-btn:hover{background:#c93a3f;transform:translateY(-1px);box-shadow:0 4px 12px rgba(229,72,77,.35)}
  .pcmt{color:#e58d0a}
  .pgbar{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;align-items:center;margin:22px 0 6px}
  .pg{border:1px solid #e2ded8;background:#fff;color:#666;border-radius:99px;padding:6px 13px;font-size:12.5px;cursor:pointer;font-family:inherit;transition:.2s}
  .pg:hover:not(.off){border-color:#e5484d;color:#e5484d}
  .pg.on{border-color:#e5484d;background:#e5484d;color:#fff}
  .pg.off{opacity:.35;cursor:default}
  .pginfo{font-size:12px;color:#999;margin-left:6px}
.sect{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.sect h2{font-size:19px;color:#2b2b2b;position:relative;padding-left:12px;white-space:nowrap}
.sect h2::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:#e5484d}
.sect span{font-size:13px;color:#aaa;white-space:nowrap}
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
footer .disc{display:inline-block;max-width:640px;margin-top:6px;color:#b4b0a9;line-height:1.7}
footer .disc-link,footer a{color:#e5484d;text-decoration:none}
footer .foot-mail{font-size:13.5px;font-weight:600}
footer .disc-link:hover{text-decoration:underline}
@media (max-width:720px){
  main{padding:18px 14px 32px}
  .upd{padding:12px 14px;font-size:13px}
  .post{flex-wrap:wrap;gap:12px;padding:14px}
  .date{width:52px;height:52px;border-radius:10px}
  .date b{font-size:19px}
  .ptitle{font-size:15px;word-break:break-word;line-height:1.5}
  /* 缩略图（2026-10-06 定稿）：flex:1 1 0 平分整行 → 5 张图铺满不留空、不溢出；
     锁 max-width:55px → 大屏机型不再被拉得过大，小屏窄容器自动收缩不溢出。
     min-width:0 + overflow:hidden 是安全边界（父容器 .post 是 flex，
     子项写 flex:1 1 0 时不给 min-width:0 会撑破布局，曾实测把页面撑到 6562px 宽）。 */
  .covers{flex:1 1 100%;order:3;min-width:0;overflow:hidden;padding-bottom:2px}
  .covers img{flex:1 1 0;min-width:0;max-width:55px;width:auto;height:auto;aspect-ratio:1/1}
  .arrow{display:none}
  .ggrid{grid-template-columns:repeat(2,1fr);gap:10px}
  .g-title{font-size:13px}
}
</style>
${SITE_ICON_TAGS}
</head>
<body>
<header>
${navHeaderHtml('')}
</header>
<main>
  <div class="upd"><span class="tag">游戏资源</span>本站点共上传了 <b>${totalGames}</b> 款游戏资源</div>
  <div class="upd-note">右上角可搜索游戏（搜"关键词"NO全名）；没搜到的，可在置顶评论区留言游戏全名，站长看到会尽快补上</div>
  <div class="sect"><h2>每日分享</h2><span>${days.length} 期</span><a class="dyx-btn" href="https://tkporl.github.io/hyfxdyx/" target="_blank" rel="noreferrer">备用站</a></div>
  <div id="dayLis">${dayLis || '<div class="empty">暂无分享</div>'}</div>
</main>
<footer>${SITE_FOOTER}</footer>
${popupHtml}
${topButton}
${SITE.comments.enabled && SITE.comments.url && SITE.comments.anonKey ? viewScript(SITE.comments.url.replace(/\/+$/, ''), SITE.comments.anonKey, '/index.html') : ''}
${indexScript}
<script src="assets/js/nav.js?v=${NAVJS_VER}"></script>
${SMOOTH_SCRIPTS}
</body>
</html>
`;
  // 首页缩略图同样加图床兜底
  // 2026-10-06：合集首页从最新帖子页派生，继承了帖子页 nav（含「首页」项）。
  // 首页不显示「首页」按钮（当前页不需要自我导航），写盘前摘掉。
  const indexOut = index.replace(/\n\s*<a href="index\.html">首页<\/a>/g, '');
  fs.writeFileSync('index.html', injectJsdelivrFallback(injectImgFallback(indexOut)));
  console.log('index.html ok (合集模式), days:', days.length);

  // #28/#50/#51：底部导航行 =「← 上一期 ｜ 官网 全部黄油 解压教程 ｜ 下一期 →」。
  //   链序与首页一致（days 已按置顶在前+时间倒序）。求助贴 qzt 置顶且不是期数：上一期置灰、下一期指向最新一期；
  //   普通期帖之间按期数互链（上一期=更早一期，下一期=更新一期，不含 qzt）
  {
    const chain = days.filter(d => path.parse(d.file).name !== 'qzt');
    const navBtn = (href, label, disabled) => disabled
      ? `<span class="mrhx-btn mrhx-btn-nav" style="opacity:.35;cursor:default">${label}</span>`
      : `<a class="mrhx-btn mrhx-btn-nav" href="${esc(href)}">${label}</a>`;
    const navMid = NAV.map(n => `<a class="mrhx-btn mrhx-btn-nav" href="${esc(n.url)}"${/^https?:/i.test(n.url) ? ' target="_blank" rel="noreferrer"' : ''}>${esc(n.label)}</a>`).join('\n    ');
    const mkNav = (older, newer) => `\n  <!--mrhx-daynav--><div class="mrhx-navrow">` +
      navBtn(older ? older.file : '', '← 上一期', !older) +
      `<div class="mrhx-navmid">${navMid}</div>` +
      navBtn(newer ? newer.file : '', '下一期 →', !newer) +
      `</div><!--mrhx-daynav-end-->\n  `;
    const injectNav = (file, nav) => {
      let h = fs.readFileSync(file, 'utf8');
      h = h.replace(/<!--mrhx-daynav-->[\s\S]*?<!--mrhx-daynav-end-->\s*/g, '');
      const anchor = h.indexOf('<!--mrhx-comments-->');
      if (anchor >= 0) h = h.slice(0, anchor) + nav + h.slice(anchor);
      else h = h.replace('</body>', nav + '</body>');
      fs.writeFileSync(file, h);
    };
    const qztDay = days.find(d => path.parse(d.file).name === 'qzt');
    chain.forEach((d, i) => {
      // 链首期帖的上一期 = 置顶求助贴（与首页序一致：qzt 第一、期帖接在后面）
      const older = i === 0 ? (qztDay || null) : chain[i + 1];
      injectNav(d.file, mkNav(older, chain[i - 1]));
    });
    if (qztDay) injectNav(qztDay.file, mkNav(null, chain[0]));
    console.log('day-nav ok:', chain.length + (qztDay ? 1 : 0), 'posts');
  }

  // 发布骨架（替代“拿 8.10.html 当模板”）：从最新帖子剥离所有帖子专属内容，
  //   生成干净的 assets/template-skeleton.html 供后台表单发布取壳。
  //   骨架里没有评论区/浏览量脚本/导航，gen.js 发布后会重新注入正确路径，从根上消除串帖/按钮嵌套两类中间态 bug
  {
    const src = days.length ? days[0].file : null;
    if (src) {
      let sk = fs.readFileSync(src, 'utf8');
      sk = sk.replace(/<!--mrhx-comments-->[\s\S]*?<!--mrhx-comments-end-->\s*/g, '');
      sk = sk.replace(/<!--view-track-->[\s\S]*?<!--view-track-end-->\s*/g, '');
      sk = sk.replace(/<!--mrhx-daynav-->[\s\S]*?<!--mrhx-daynav-end-->\s*/g, '');
      sk = sk.replace(/\s*<!--mrhx-stagger--><style>[\s\S]*?<\/style>\s*/g, '\n');
      // node-list 含嵌套 ul（image-list），用深度计数找到配对闭合，避免贪婪匹配吞掉 footer/弹窗
      {
        const tag = '<ul class="node-list">';
        const s0 = sk.indexOf(tag);
        if (s0 >= 0) {
          let depth = 0, i = s0;
          for (; i < sk.length; i++) {
            if (sk.startsWith('<ul', i)) { depth++; i += 2; }
            else if (sk.startsWith('</ul>', i)) { depth--; i += 4; if (depth === 0) break; }
          }
          // i 停在 `</ul>` 的 `>` 上（循环里 i += 4 后 break），所以要从 i+1 切片；
          // 写成 i+5 会多吞掉后面的 4 个字符，把 `</ul> <div class="publish"` 切成 `</ul>v class="publish"`
          sk = sk.slice(0, s0) + tag + '\n  </ul>' + sk.slice(i + 1);
        }
      }
      sk = sk.replace(/<div class="title">[\s\S]*?<\/div>/, '<div class="title">新帖子标题</div>');
      sk = sk.replace(/<title>[^<]*<\/title>/, '<title>发布骨架模板</title>');
      sk = sk.replace(/<!--mrhx-seo-->[\s\S]*?<!--\/mrhx-seo-->/g, '');
      fs.writeFileSync('assets/template-skeleton.html', sk);
      console.log('template-skeleton ok');
    }
  }

  // #32 瘦身：只保留必要字段，简介截前 80 字（当前 250KB，全量简介是体积大头）
  const slimIndex = searchIndex.map(g => ({
    title: g.title,
    url: g.url,
    img: g.img,
    plat: g.plat,
    links: g.links,
    intro: (g.intro || '').slice(0, 80),
    source: g.source
  }));
  fs.writeFileSync('search_index.json', JSON.stringify(slimIndex));
  console.log('search_index.json ok, games:', slimIndex.length);

  fs.writeFileSync('game_index.json', JSON.stringify(gameIndex, null, 2));
  console.log('game_index.json ok, posts:', Object.keys(gameIndex).length);

  verify(days, index, searchIndex);

  const searchPage = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>搜索 · ${esc(SITE_NAME)}</title>
${seoHead('search.html', '搜索')}
<meta name="robots" content="noindex,follow">
${SITE_ICON_TAGS}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh}
${NAV_CSS}
main{max-width:900px;margin:0 auto;padding:28px 20px 60px}
.sect{display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.sect h2{font-size:19px;color:#2b2b2b;position:relative;padding-left:12px;white-space:nowrap}
.sect h2::before{content:'';position:absolute;left:0;top:2px;bottom:2px;width:4px;border-radius:2px;background:#e5484d}
.sect span{font-size:13px;color:#aaa;white-space:nowrap}
.result{border:1px solid #ecebe9;border-radius:14px;background:#fff;padding:18px 20px;margin-bottom:14px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.result .rt{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.result .rt a{font-size:16px;color:#2b2b2b;text-decoration:none;border-bottom:2px solid transparent;transition:color .15s,border-color .15s;padding-bottom:1px}
.result .rt a:hover{color:#e5484d;border-bottom-color:#e5484d}
.result .rt .src{font-size:11px;color:#fff;background:#e5484d;border-radius:99px;padding:2px 10px}
.result .intro{font-size:13px;color:#666;line-height:1.8;margin-bottom:10px;word-break:break-word}
.result .dl{display:flex;gap:8px;flex-wrap:wrap}
.result .img{margin-top:10px}
.result .img img{max-width:100%;border-radius:10px;border:1px solid #ecebe9}
.result.exact{border-left:3px solid #e5484d}
.btn-dl{display:inline-flex;align-items:center;padding:8px 16px;border-radius:9px;font-size:13px;font-weight:600;text-decoration:none}
.btn-dl-m{background:#e5484d;color:#fff}
.btn-dl-b{background:#e6f4ea;color:#1a7f37;border:1px solid #b7e2c4}
.empty{text-align:center;color:#999;padding:40px 0;font-size:14px}
.empty-box{background:#fff;border:1px solid #ecebe9;border-radius:14px;padding:28px 20px;margin-bottom:18px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.empty-box h3{font-size:15px;color:#2b2b2b;margin-bottom:8px}
.empty-box p{font-size:13px;color:#999;margin-bottom:14px}
.suggest-list{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.suggest-tag{display:inline-block;background:#faf9f7;border:1px solid #ecebe9;border-radius:9px;padding:6px 14px;font-size:13px;color:#555;text-decoration:none;transition:.2s}
.suggest-tag:hover{border-color:#e5484d;color:#e5484d;background:#fff}
.loading-box{text-align:center;padding:40px 0;color:#aaa;font-size:14px}
.loading-box .spinner{display:inline-block;width:22px;height:22px;border:2.5px solid #ecebe9;border-top-color:#e5484d;border-radius:50%;animation:spin .7s linear infinite;margin-bottom:8px}
@keyframes spin{to{transform:rotate(360deg)}}
.search-hist{display:flex;align-items:center;gap:6px;margin-bottom:14px;flex-wrap:wrap}
.search-hist span{font-size:12px;color:#bbb}
.hist-tag{display:inline-block;background:#fff;border:1px solid #ecebe9;border-radius:9px;padding:4px 12px;font-size:12px;color:#888;text-decoration:none;transition:.2s}
.hist-tag:hover{border-color:#e5484d;color:#e5484d}
.hist-tag .del{margin-left:4px;font-size:10px;color:#ccc;cursor:pointer}
.hist-tag .del:hover{color:#e5484d}
.no-hist{text-align:center;color:#ccc;font-size:12px;padding:10px 0}
@media (max-width:720px){main{padding:18px 14px 32px}}
</style>
</head>
<body>
<header>
${navHeaderHtml('', 'q')}
</header>
<main>
  <div class="sect"><h2>搜索结果</h2><span id="count" role="status" aria-live="polite" aria-atomic="true"></span></div>
  <div id="res" aria-busy="false"></div>
</main>
<script src="assets/js/nav.js?v=${NAVJS_VER}"></script>
<footer>${SITE_FOOTER}</footer>
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
  var HIST_KEY = 'mrhx_search_hist';
  var MAX_HIST = 8;
  function getHist() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch(e) { return []; } }
  function saveHist(kw) {
    if (!kw) return;
    var h = getHist().filter(function (v) { return v !== kw; });
    h.unshift(kw);
    if (h.length > MAX_HIST) h = h.slice(0, MAX_HIST);
    try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch(e) {}
  }
  function clearHist() { try { localStorage.removeItem(HIST_KEY); } catch(e) {} }
  function renderHist() {
    var h = getHist();
    if (!h.length) return '';
    var tags = h.map(function (kw) {
      return '<a class="hist-tag" href="search.html?q=' + encodeURIComponent(kw) + '">' + esc(kw) + '<span class="del" data-kw="' + esc(kw) + '">×</span></a>';
    }).join('');
    return '<div class="search-hist"><span>搜索历史</span>' + tags + '<a class="hist-tag" href="javascript:void(0)" id="clear-hist" style="color:#e5484d;border-color:#e5484d">清空</a></div>';
  }
  function emptyHtml(kw) {
    return '<div class="empty-box"><h3>' + (kw ? '没有找到与「' + esc(kw) + '」相关的游戏' : '请使用上方搜索框搜索游戏') + '</h3>' +
      '<p>' + (kw ? '换个关键词试试，或回到首页浏览' : '返回首页浏览每日分享内容') + '</p>' +
      '<a class="btn-dl btn-dl-m" href="index.html" style="border:none;cursor:pointer">回到首页</a></div>';
  }
  function rowHtml(g, isExact) {
    var dl = (g.links || []).map(function (l) {
      var cls = l.url.indexOf('pan.baidu.com') > -1 ? 'btn-dl btn-dl-b' : 'btn-dl btn-dl-m';
      return '<a class="' + cls + '" href="' + esc(l.url) + '" target="_blank" rel="noreferrer">' + esc(l.label) + '</a>';
    }).join('');
    return '<div class="result' + (isExact ? ' exact' : '') + '"><div class="rt"><a href="' + esc(g.url || '') + '">' + esc(g.title) + '</a><span class="src">' + esc(g.source) + '</span></div>' +
      (g.intro ? '<div class="intro">' + esc(g.intro) + '</div>' : '') +
      (dl ? '<div class="dl">' + dl + '</div>' : '') +
      (g.img ? '<div class="img"><img src="' + esc(g.img) + '" alt="" loading="lazy"></div>' : '') +
      '</div>';
  }
  function setMore(show) {
    var b = document.getElementById('mrhx-more');
    if (b) b.style.display = show ? '' : 'none';
  }
  function renderMore() {
    var slice = _hits.slice(_page * ALL, (_page + 1) * ALL);
    resBox.insertAdjacentHTML('beforeend', slice.map(function (g) { return rowHtml(g, g._exact); }).join(''));
    // 「加载更多」必须始终待在列表最下面：新结果是用 beforeend 追加的，
    // 所以每轮渲染完要把按钮重新挪到末尾，否则点一次它就被顶到上面去了
    resBox.appendChild(moreWrap);
    _page++;
    setMore(_page * ALL < _hits.length);
  }
  var moreWrap = document.createElement('div');
  moreWrap.innerHTML = '<button id="mrhx-more" type="button" class="btn-dl btn-dl-m" style="border:none;cursor:pointer;padding:10px 28px;border-radius:9px;font-size:14px;font-weight:600">加载更多</button>';
  moreWrap.style.textAlign = 'center';
  moreWrap.style.marginTop = '6px';
  moreWrap.style.marginBottom = '6px';
  resBox.appendChild(moreWrap);
  document.getElementById('mrhx-more').onclick = renderMore;
  setMore(false);
  if (!q) { countEl.textContent = ''; resBox.innerHTML = '<div class="empty-box"><h3>请使用上方搜索框搜索游戏</h3><p>输入游戏名称或关键词即可搜索</p><a class="btn-dl btn-dl-m" href="index.html" style="border:none;cursor:pointer">回到首页</a></div>'; setMore(false); bindHistClick(); return; }
  fetch('search_index.json').then(function (r) { return r.json(); }).then(function (data) {
    if (!q) {
      // Direct access without query - show return to homepage message
      setMore(false);
      bindHistClick();
      return;
    }
    saveHist(q);
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
    function matchScore(g) {
      var titleLower = (g.title || '').toLowerCase();
      var introLower = (g.intro || '').toLowerCase();
      if (titleLower === kw) return 0;
      if (titleLower.indexOf(kw) > -1) return 1;
      if (introLower.indexOf(kw) > -1) return 2;
      if (titleLower.indexOf(kw.split('').join('%')) > -1) return 3;
      return 4;
    }
    _hits = data.filter(function (g) {
      return fuzzyMatch(g.title, kw) || fuzzyMatch(g.intro, kw) || fuzzyMatch(g.plat, kw);
    });
    if (_hits.length) {
      _hits.sort(function (a, b) { return matchScore(a) - matchScore(b); });
      _hits.forEach(function (g) { g._exact = matchScore(g) <= 1; });
    }
    countEl.textContent = '（找到 ' + _hits.length + ' 个）';
    if (!_hits.length) {
      // Show random recommended games
      var shuffled = data.slice().sort(function () { return 0.5 - Math.random(); });
      _hits = shuffled.slice(0, 12);
      _hits.forEach(function (g) { g._exact = false; });
      resBox.innerHTML = '<div class="empty-box"><h3>没有找到与「' + esc(kw) + '」相关的游戏</h3><p>为你推荐以下游戏</p></div>';
      renderMore();
      return;
    }
    renderMore();
  }).catch(function () { resBox.innerHTML = '<div class="empty-box"><h3>搜索索引加载失败</h3><p>请检查网络后刷新页面</p><a class="btn-dl btn-dl-m" href="javascript:location.reload()" style="border:none;cursor:pointer">重新加载</a> <a class="btn-dl btn-dl-m" href="index.html" style="border:none;cursor:pointer;margin-left:6px">回到首页</a></div>'; setMore(false); });
  function bindHistClick() {
    var delBtns = document.querySelectorAll('.hist-tag .del');
    delBtns.forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault(); e.stopPropagation();
        var kw = el.getAttribute('data-kw');
        var h = getHist().filter(function (v) { return v !== kw; });
        try { localStorage.setItem(HIST_KEY, JSON.stringify(h)); } catch(e) {}
        el.parentElement.remove();
      };
    });
    var clearBtn = document.getElementById('clear-hist');
    if (clearBtn) clearBtn.onclick = function () { clearHist(); var c = document.querySelector('.search-hist'); if (c) c.remove(); };
  }
  bindHistClick();
})();
</script>
</body>
</html>
`;
  fs.writeFileSync('search.html', searchPage);
  console.log('search.html ok');

  // ===== 期A：独立游戏页生成（game/<自增编号>.html）=====
  // 设计确认书：【期A·独立页生成器·设计确认书】20261009.md
  // 锚 = 来源帖slug__封面文件名（重排/改介绍不变）；对照表 game-id-map.json 记「锚→编号」，
  //   删除的编号永不复用；对照表地位等同 timestamps.json，绝不能丢。
  let gamePages = [];
  {
    const MAP_FILE = 'game-id-map.json';
    let idMap = {};
    if (fs.existsSync(MAP_FILE)) {
      try { idMap = readJson(MAP_FILE); }
      catch (e) { throw new Error('game-id-map.json 解析失败——它记录着全部独立页编号，乱用会打乱所有网址，中止生成。修复后再跑。'); }
    }
    const usedNums = new Set(Object.values(idMap).map(Number));
    let nextNum = 1;
    while (usedNums.has(nextNum)) nextNum++;
    const contentHash = s => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x.toString(36); };
    const anchorRaw = g => path.parse(g.url || 'unknown').name + '__' + ((g.img || '').split('/').pop().replace(/\.[a-z]+$/i, ''));
    // 锚去重：同帖同图（老帖通用图名/无图条目）追加内容哈希（与顺序无关，重排不变形）
    const seenAnchor = {};
    const entries = searchIndex.map(g => {
      let a = anchorRaw(g);
      if (seenAnchor[a]) a += '-' + contentHash(g.title + '|' + (g.intro || '') + '|' + (g.links || []).map(l => l.url).join(','));
      seenAnchor[a] = 1;
      return { g, a };
    });
    for (const { a } of entries) {
      if (!idMap[a]) { idMap[a] = String(nextNum); usedNums.add(nextNum); nextNum++; }
    }
    fs.writeFileSync(MAP_FILE, JSON.stringify(idMap));
    const g2num = new Map(entries.map(e => [e.g, idMap[e.a]]));

    fs.mkdirSync('game', { recursive: true });
    const cm = SITE.comments;
    const cmOn = !!(cm.enabled && cm.url && cm.anonKey);
    const cmSb = cmOn ? esc(cm.url.replace(/\/+$/, '')) : '';
    const cmKey = cmOn ? esc(cm.anonKey) : '';
    const cmFold = cmOn && Number(cm.foldThreshold) > 0 ? Number(cm.foldThreshold) : 6;
    const platClassOf = p => (/安卓/.test(p) && /PC/i.test(p)) ? 'both' : /安卓/.test(p) ? 'az' : /PC/i.test(p) ? 'pc' : '';
    const fmtTs = ts => { const d = new Date(ts); return isNaN(d) ? '' : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; };
    const kept = new Set();

    entries.forEach(({ g, a }) => {
      const num = idMap[a];
      const key = String(num);
      const fname = key + '.html';
      kept.add(fname);
      const pagePath = '/game/' + fname;
      const slug = path.parse(g.url || '').name;
      const ts = TIMESTAMPS[slug] || '';
      const pc = platClassOf(g.plat || '');
      // 相关推荐：同帖优先，不足补同平台，6 个（生成时算好写死）
      const rel = [];
      for (const x of searchIndex) { if (x !== g && x.url === g.url && rel.length < 6) rel.push(x); }
      for (const x of searchIndex) { if (x !== g && x.plat === g.plat && !rel.includes(x) && rel.length < 6) rel.push(x); }
      const relHtml = rel.map(x => {
        const n = g2num.get(x);
        const ximg = x.img || (CDN_URL + '/logo.webp');
        return `<a class="rcard" href="game/${n}.html"><div class="c"><img loading="lazy" src="${esc(ximg)}" alt="${esc(x.title)}"><span class="p">${esc(x.plat || '')}</span></div><div class="i"><div class="t">${esc(x.title)}</div></div></a>`;
      }).join('');
      const dlBtns = (g.links && g.links.length)
        ? g.links.map((l, i) => `<a class="dl-btn ${i === 0 ? 'primary' : 'alt'}" href="${esc(l.url)}" target="_blank" rel="noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 21h14"/></svg>${esc(l.label || '下载地址')}</a>`).join('')
        : '<span class="dl-none">暂无下载链接，请到来源帖查看</span>';
      const jsonLd = JSON.stringify({ '@context': 'https://schema.org', '@type': 'VideoGame', name: g.title, image: g.img || undefined, description: (g.intro || '').slice(0, 300) || undefined, genre: g.plat || undefined, url: SITE_URL + 'game/' + fname });
      const likeScript = cmOn ? `
<script>
(function () {
  var SB = '${cmSb}', KEY = '${cmKey}', ID = '${pagePath}';
  var h = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY };
  var base = 0;
  function render() {
    var liked = false;
    try { liked = localStorage.getItem('mrhyfx_like_' + ID) === '1'; } catch (e) {}
    var b = document.getElementById('likeBtn');
    if (!b) return;
    b.classList.toggle('liked', liked);
    b.disabled = liked;
    document.getElementById('likeTxt').textContent = liked ? '已赞 ' + base : '点赞 ' + base;
  }
  fetch(SB + '/rest/v1/game_likes?select=count&game_id=eq.' + encodeURIComponent(ID), { headers: h })
    .then(function (r) { return r.json(); })
    .then(function (rows) { base = (rows && rows[0] && rows[0].count) || 0; render(); })
    .catch(function () { render(); });
  var btn = document.getElementById('likeBtn');
  if (btn) btn.addEventListener('click', function () {
    try { if (localStorage.getItem('mrhyfx_like_' + ID) === '1') return; } catch (e) { return; }
    btn.disabled = true;
    fetch(SB + '/rest/v1/rpc/inc_game_like', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ p_id: ID }) })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (c) { base = Number(c) || base + 1; try { localStorage.setItem('mrhyfx_like_' + ID, '1'); } catch (e) {} render(); })
      .catch(function () { btn.disabled = false; document.getElementById('likeTxt').textContent = '点赞失败，请重试'; });
  });
})();
</script>` : '';
      const page = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(g.title)} - ${esc(SITE_NAME)}</title>
<base href="${SITE_URL}">
${seoHead('game/' + fname, g.title, { desc: (g.intro || '').slice(0, 120), ogImg: g.img || '' })}
${SITE_ICON_TAGS}
<script type="application/ld+json">${jsonLd}</script>
<style>
${NAV_CSS}
</style>
<link rel="stylesheet" href="assets/css/site.css?v=${CSS_VER}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html{background:#faf9f7}
html,body{overflow-x:clip}
body{background:#faf9f7;color:#2b2b2b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;min-height:100vh;-webkit-font-smoothing:antialiased}
img{display:block;max-width:100%}
button{font-family:inherit;cursor:pointer;border:none;background:none}
main{max-width:1080px;margin:0 auto;padding:26px 20px 56px}
.crumbs{font-size:13px;color:#999;margin-bottom:18px}
.crumbs a{color:#8a857e;text-decoration:none;transition:.15s}
.crumbs a:hover{color:#e5484d}
.detail{display:grid;grid-template-columns:340px minmax(0,1fr);gap:38px;background:#fff;border:1px solid #ecebe9;border-radius:18px;padding:34px;box-shadow:0 2px 10px rgba(43,43,43,.05)}
.d-cover{width:100%;aspect-ratio:16/11;object-fit:cover;border-radius:12px;background:#f4f2ef;box-shadow:0 4px 16px rgba(43,43,43,.08)}
.d-headrow{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.d-title{font-size:26px;font-weight:800;line-height:1.35;flex:1;min-width:200px}
.badge{font-size:13px;font-weight:600;border-radius:8px;padding:5px 13px;display:inline-block;margin-top:6px}
.badge.plat-both{background:#e5484d;color:#fff}
.badge.plat-pc{background:#3949ab;color:#fff}
.badge.plat-az{background:#4a7326;color:#fff}
.badge.plat-none{background:#f1efe9;color:#888}
.badge.time{background:#f1efe9;color:#888;font-size:12.5px;margin:0 0 4px}
.dl-zone{margin-top:22px;background:#f8faf7;border:1px solid #e3ede6;border-radius:14px;padding:18px 20px}
.dl-title{font-size:12.5px;font-weight:700;color:#5c8a6e;letter-spacing:2px;margin:0 0 12px;display:flex;align-items:center;gap:7px}
.dl-title::before{content:'';width:7px;height:7px;border-radius:50%;background:#1a9e5c}
.dl-btns{display:flex;gap:10px;flex-wrap:wrap}
.dl-btn{display:inline-flex;align-items:center;gap:7px;padding:12px 24px;border-radius:10px;font-size:15px;font-weight:600;transition:.2s;text-decoration:none}
.dl-btn:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(26,158,92,.25)}
.dl-btn.primary{background:#1a9e5c;color:#fff;border:1px solid #1a9e5c}
.dl-btn.primary:hover{background:#178a50}
.dl-btn.alt{background:#fff;color:#444;border:1px solid #e2ded8}
.dl-btn.alt:hover{color:#1a9e5c;border-color:#bcd9c9;box-shadow:0 6px 16px rgba(0,0,0,.08)}
.dl-btn svg{width:15px;height:15px}
.dl-none{color:#999;font-size:14px}
.dl-note{margin-top:12px;font-size:12.5px;color:#9aa89f;line-height:1.7}
.dl-note a{color:#e5484d}
.intro{margin-top:26px;padding-top:24px;border-top:1px dashed #ecebe9}
.intro h3,.rel h3{font-size:17px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.intro h3::before,.rel h3::before{content:'';width:4px;height:15px;border-radius:2px;background:#e5484d}
.intro .txt{font-size:15px;color:#444;line-height:1.9;white-space:pre-wrap;word-break:break-word}
.like-center{display:flex;justify-content:flex-end;margin:18px 0 0;padding-top:16px;border-top:1px dashed #ecebe9}
.like-btn{display:inline-flex;align-items:center;gap:8px;font-size:14.5px;font-weight:600;color:#555;background:#fff;border:1px solid #ecebe9;border-radius:10px;padding:10px 24px;transition:.18s}
.like-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
.like-btn:hover{color:#e5484d;border-color:#f0b4b6;background:#fdf3f3}
.like-btn.liked{color:#e5484d;background:#fdf3f3;border-color:#f0b4b6}
.rel{margin-top:32px}
.rel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:16px}
footer{margin:34px auto 0;padding:18px 20px 26px;max-width:1040px;text-align:center;font-size:12.5px;color:#b8b2aa;border-top:1px solid #ecebe9}
.rcard{background:#fff;border:1px solid #ecebe9;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:.2s;display:block;text-decoration:none}
.rcard:hover{border-color:#f0b4b6;transform:translateY(-3px);box-shadow:0 10px 28px rgba(0,0,0,.08)}
.rcard .c{position:relative;aspect-ratio:16/10;overflow:hidden;background:#f4f2ef}
.rcard .c img{width:100%;height:100%;object-fit:cover;object-position:top}
.rcard .p{position:absolute;left:8px;top:8px;font-size:10.5px;font-weight:600;color:#fff;background:rgba(43,43,43,.72);border-radius:6px;padding:2px 7px}
.rcard .i{padding:12px 14px 14px;border-top:1px solid #ecebe9}
.rcard .t{font-size:14.5px;font-weight:600;line-height:1.5;height:44px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#2b2b2b}
.rcard:hover .t{color:#e5484d}
/* 评论模块：脚本可能插入 body 直下，统一限宽居中 */
#mrhx-comments{max-width:1040px;margin:30px auto 0}
.rcard:hover .t{color:#e5484d}
.comments-wrap{margin-top:28px}
/* 评论父/子同款 + 组外框（备用站验证版） */
.mrhx-creply-item{margin-left:0!important;width:100%;min-width:0;max-width:100%;box-sizing:border-box;background:#fff;border:1px solid #ecebe9;border-left:1px solid #ecebe9;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,.03);padding:12px 14px}
.mrhx-creply-item:hover{border-color:#f0b4b6;box-shadow:0 6px 18px rgba(229,72,77,.08)}
.mrhx-group{border:1px solid #f0e6e2;border-radius:12px;padding:4px 4px 0;margin-bottom:10px;background:#fcfaf8}
.mrhx-group .mrhx-citem,.mrhx-group .mrhx-creply-item{margin-bottom:4px}
@media (max-width:720px){
  main{padding:16px 14px 32px}
  .detail{grid-template-columns:1fr;padding:18px;gap:20px}
  .d-cover{max-width:260px}
  .mrhx-creply-item .mrhx-ccontent{padding-left:0}
  .mrhx-creply-item .mrhx-cbar{padding-left:0}
}
</style>
</head>
<body>
<header>
${navHeaderHtml('')}
</header>
<main>
  <div class="crumbs"><a href="index.html">首页</a> / <a href="${esc(g.url || 'index.html')}">${esc(g.source || '来源帖')}</a> / <span>${esc(g.title)}</span></div>
  <section class="detail">
    <img class="d-cover" src="${esc(g.img || (CDN_URL + '/logo.webp'))}" alt="${esc(g.title)}">
    <div>
      <div class="d-headrow"><h1 class="d-title">${esc(g.title)}</h1>${g.plat ? `<span class="badge plat-${pc || 'none'}">${esc(g.plat)}</span>` : ''}</div>
      ${ts ? `<span class="badge time">发布于 ${esc(fmtTs(ts))}</span>` : ''}
      <div class="dl-zone">
        <div class="dl-title">下载地址</div>
        <div class="dl-btns">${dlBtns}</div>
        <p class="dl-note">链接自动同步自每日分享，若失效请到<a href="${esc(g.url || 'index.html')}">来源帖</a>留言。安卓游戏请先看解压教程再安装。</p>
      </div>
      <div class="intro"><h3>游戏介绍</h3><div class="txt">${esc(g.intro || '暂无介绍。')}</div></div>
      ${cmOn ? `<div class="like-center"><button type="button" class="like-btn" id="likeBtn"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.7-10-9.3C.6 8.6 2.6 5 6.2 5c2.2 0 3.7 1.2 4.6 2.6h2.4C14.1 6.2 15.6 5 17.8 5c3.6 0 5.6 3.6 4.2 6.7C19.5 16.3 12 21 12 21z"/></svg><span id="likeTxt">点赞 …</span></button></div>` : ''}
    </div>
  </section>
  <div class="comments-wrap" id="commentsHost"></div>
  <section class="rel">${rel.length ? `<h3>相关推荐</h3><div class="rel-grid">${relHtml}</div>` : ''}</section>
</main>
<footer>${SITE_FOOTER}</footer>
${topButton}
<script src="assets/js/nav.js?v=${NAVJS_VER}"></script>
${SMOOTH_SCRIPTS}
${cmOn ? viewScript(cmSb, cmKey, pagePath) : ''}
${cmOn ? `<!--mrhx-comments-->\n<script>window.MRHXC={sb:'${cmSb}',key:'${cmKey}',path:'${pagePath}',fold:${cmFold}};</script>\n<script src="assets/js/comments.js"></script>\n<!--mrhx-comments-end-->` : ''}
${likeScript}
<script>
/* 评论父/子分组外框（先收集整组再移动；评论脚本异步渲染+翻页都持续生效） */
(function () {
  function regroup() {
    var list = document.getElementById('mrhx-clist');
    if (!list) return;
    [].slice.call(list.children).forEach(function (el) {
      if (el.classList.contains('mrhx-group')) return;
      if (el.classList.contains('mrhx-citem') && !el.classList.contains('mrhx-creply-item')) {
        var grp = [el];
        var n = el.nextElementSibling;
        while (n && n.classList.contains('mrhx-creply-item')) { grp.push(n); n = n.nextElementSibling; }
        var w = document.createElement('div');
        w.className = 'mrhx-group';
        el.parentNode.insertBefore(w, el);
        grp.forEach(function (x) { w.appendChild(x); });
      }
    });
  }
  var mo = new MutationObserver(regroup);
  function arm() {
    var list = document.getElementById('mrhx-clist');
    if (list) { mo.observe(list, { childList: true }); regroup(); }
    else setTimeout(arm, 300);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
  else arm();
})();
</script>
</body>
</html>`;
      fs.writeFileSync(path.join('game', fname), page);
      const mod = ts ? new Date(ts).toISOString().slice(0, 10) : undefined;
      gamePages.push({ loc: SITE_URL + 'game/' + fname, pri: '0.4', mod: mod || undefined });
    });
    // 残页清理：索引中已消失的游戏，对应页面逐个删除（单文件 unlink，非递归）
    if (fs.existsSync('game')) {
      for (const f of fs.readdirSync('game')) {
        if (f.endsWith('.html') && !kept.has(f)) { fs.unlinkSync(path.join('game', f)); console.log('game 残页清理:', f); }
      }
    }
    console.log('game pages ok:', kept.size, '(map:', Object.keys(idMap).length + ')');
  }

  // ===== SEO: sitemap.xml + robots.txt =====
  const today = new Date().toISOString().slice(0, 10);
  const smEntries = [{ loc: SITE_URL, pri: '1.0', mod: today }];
  for (const gp of gamePages) {
    smEntries.push({ loc: gp.loc, pri: gp.pri, mod: gp.mod || today });
  }
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
  await cleanupMarkedRawImages();

  // 自动 commit + push（GitHub Actions 中跳过，由 workflow 处理；--verify 模式不发布）
  if (NEW_TAG && NEW_TAG !== 'auto' && !process.env.CI) {
    // NEW_TAG 已在顶部校验过格式，此处双重保险防 shell 注入
    if (!/^\d{8}(?:[-_][\w.-]+)?$/.test(NEW_TAG)) throw new Error('非法 NEW_TAG: ' + NEW_TAG);
    try {
      execFileSync('git', ['add', '-A'], { stdio: 'inherit' });
      execFileSync('git', ['commit', '-m', '发布 ' + NEW_TAG], { stdio: 'inherit' });
      execFileSync('git', ['push'], { stdio: 'inherit' });
      console.log(`\n✅ ${NEW_TAG} 发布完成`);
    } catch (e) {
      console.error('git 操作失败:', e.message);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
