const fs = require('fs');
const path = require('path');
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

// #48：非帖子页排除名单从 site.json 的 build.excludePosts 读；硬编码默认名单兼并，配置丢了也不会把后台页当帖子
const DEFAULT_EXCLUDE = ['index.html', 'publish.html', 'Tsinhoht.html', 'search.html', 'email-preview.html', 'comments-preview.html', 'site-preview.html', 'jinri.html', '404.html', '卡片布局原型.html', '图床对接演示.html'];
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
// 图片域名统一用 cdn.jsdelivr.net（站长实测：新上传图偶有缓存延迟但可用；gcore 等镜像在站长网络下反而不可靠）。
//   历史页面里残留的其他 jsdelivr 镜像域名会被 localize 统一改写回主域
let CDN_URL = 'https://cdn.jsdelivr.net/gh/TKPORL/mrhyfx@main';
// 自建图床（CloudFlare-ImgBed）直链：帖子发布时若走图床模式，图片 src 是图床完整外链。
//   这些链接必须原样保留，不能被 localize 当外链下载回 GitHub 仓库（等于白搬），也不能被改写成 jsDelivr。
//   域名从 site.json 的 imgbed.baseUrl 读（后台「保存配置到站点」写入）；额外兜底内置当前已知图床域名，防止漏配。
const IMGBED_BASES = new Set();
if (SITE.imgbed && SITE.imgbed.baseUrl) IMGBED_BASES.add(String(SITE.imgbed.baseUrl).replace(/\/+$/, ''));
IMGBED_BASES.add('https://tsinho-cloudflare-imgbed.pages.dev');
IMGBED_BASES.add('https://cloudflare-imgbed-e3b.pages.dev');
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
  // 创建模态框容器
  var modal = document.createElement('div');
  modal.className = 'mrhx-detail';
  modal.innerHTML = '<div class="mrhx-detail-box"><button class="mrhx-detail-close">✕</button><h2></h2><div class="mrhx-detail-from"></div><div class="mrhx-detail-text"></div><button class="mrhx-detail-back">返回</button></div>';
  document.body.appendChild(modal);
  var box = modal.querySelector('.mrhx-detail-box');
  var h2 = box.querySelector('h2');
  var from = box.querySelector('.mrhx-detail-from');
  var text = box.querySelector('.mrhx-detail-text');
  function closeModal() { modal.classList.remove('show'); }
  modal.addEventListener('click', function(e) { if (e.target === modal || e.target === box.querySelector('.mrhx-detail-close') || e.target === box.querySelector('.mrhx-detail-back')) closeModal(); });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

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
    img.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
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
      modal.classList.add('show');
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

  const urls = [...new Set([...html.matchAll(/src="(https:\/\/[^"]+)"/g)].map(m => m[1]))]
    .filter(url => !url.includes(CDN_URL) && !/jsdelivr\.net\/gh\/TKPORL\/mrhyfx/.test(url) && !isImgBedUrl(url));
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
      done++;
    });
    let qi = 0;
    const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
      while (qi < queue.length) { const job = queue[qi++]; await job(); }
    });
    await Promise.all(workers);
  }
  // #12：公共脚本/样式目录（assets/js、assets/css）不参与帖子图片目录重写，否则会被误改写成 assets/<tag>/
  html = html.replace(/assets\/(?!js\/|css\/)[^"\/]+(?=\/)/g, 'assets/' + tag);
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
  @media (max-width:720px){body{padding-top:105px}.hwrap{padding:12px 14px}nav{gap:6px}nav a{padding:5px 10px;font-size:12px}.site img.site-logo{width:90px;height:auto}.mrhx-search input{width:90px}.sect{gap:6px}.dyx-btn{padding:4px 11px;font-size:11px;margin-left:6px}}
</style>
<link rel="icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1" type="image/png">
<link rel="apple-touch-icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="eaffbcd6d2ab070b24071cff8b189ccf.png" alt="Tsinho黄油推荐站" class="site-logo"></a>
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
          .webp({ quality: 80, alphaQuality: 100, lossless: false })
          .toBuffer();
        fs.writeFileSync(dstPath, compressed);
        console.log('  compress', safeEntry, safeFile, `-> ${dstName}.webp (${(buf.length/1024).toFixed(0)}KB -> ${(compressed.length/1024).toFixed(0)}KB)`);
      } catch (e) {
        console.warn('  compress failed:', srcPath, e.message);
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
// 后台搜索用的「帖子级别」索引：key=短文件名（如 "8.10"），value={title,games,intro}
const gameIndex = {};
(async () => {
    await compressExistingAssets();

for (const file of files) {
    let html = fs.readFileSync(POST_DIR + '/' + file, 'utf8');
    const computed = (html.match(/<li class="node[^"]*heading/g) || []).length;
    const tag = dayTag(file);
    const gameCount = overrides[tag] !== undefined ? overrides[tag] : computed;

    html = await localize(html, tag);

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
      if (contentBlock && contentBlock.indexOf('免费帮找') > -1) {
        open = open.replace(/<li class="node heading3">/, '<li class="node heading3 node-full">');
      }
      return open + contentBlock + (imgBlock ? '\n    ' + imgBlock : '') + (dlBlock ? '\n    ' + dlBlock : '') + (noteBlock ? '\n    ' + noteBlock : '') + '\n  </li>';
    });
    blocks = blocks.filter(b => b.trim().length > 0);
    return prefix + '<ul class="node-list">\n' + blocks.join('') + '\n  </ul>' + suffix;
  })(html);

    html = html.replace(PUBLISH_RE, newPublish);

    // #51：官网/全部黄油/解压教程不再以卡片形式塞进游戏列表，改放到底部「上一期/下一期」行中间（见第二遍 daynav 注入）

    const navPills = [`<a href="index.html">首页</a>`, ...NAV.map(n =>
      `<a href="${esc(n.url)}" target="_blank" rel="noreferrer">${n.label}</a>`)].join('\n    ');
    const bar = `<div class="mrhx-bar">
  <a class="mlogo" href="index.html"><img src="${CDN_URL}/eaffbcd6d2ab070b24071cff8b189ccf.png?v=1" alt="Tsinho黄油推荐站" class="mlogo-img"></a>
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
    const injected = `<!--mrhx-->\n<link rel="stylesheet" href="assets/css/site.css">\n<script>document.addEventListener('DOMContentLoaded',function(){var imgs=document.querySelectorAll('img.image');for(var i=0;i<imgs.length;i++){if(!imgs[i].complete){imgs[i].classList.add('mrhx-img-loading');imgs[i].addEventListener('load',function(){this.classList.remove('mrhx-img-loading')});imgs[i].addEventListener('error',function(){this.classList.remove('mrhx-img-loading')})}}});</script>\n${bar}\n<!--mrhx-end-->`;
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
    // 帖子页：把历史遗留的旧 CDN 图标（favicon.webp / ac9ce9ba png）统一替换为新标签图标
    html = html.replace(/<link rel="icon" href="https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^"]*?\/(?:favicon\.webp|ac9ce9ba350526f00ad5f9c02e3dfb94\.png)\?v=\d+"(?: type="image\/(?:webp|png)")?>\s*<link rel="apple-touch-icon" href="https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@[^"]*?\/(?:favicon\.webp|ac9ce9ba350526f00ad5f9c02e3dfb94\.png)\?v=\d+">/g,
      `<link rel="icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1" type="image/png">\n<link rel="apple-touch-icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1">`);
    html = html.replace('</head>', (html.includes('rel="icon" href="' + CDN_URL + '/65ce15938559e6db9958d99b29e617c1.png') ? '</head>' : `<link rel="icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1" type="image/png">
<link rel="apple-touch-icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1">
</head>`));
    html = html.replace(/<!--mrhx-seo-->[\s\S]*?<!--\/mrhx-seo-->/g, '');
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
    html = html.replace('</body>', `  ${topBtn}${commentBlock ? '\n  ' + commentBlock : ''}${vb ? '\n  ' + vb : ''}${staggerBlock}${nodeExpandScript}\n  </body>`);

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
    // 封面来源：站内 assets（jsDelivr 直链）+ 自建图床直链（图床模式发布的帖子）
    const _bedRe = [...IMGBED_BASES].map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const covers = [...new Set([...dayHtml.matchAll(new RegExp('src="(https:\\/\\/(?:cdn|gcore|fastly|testingcf)\\.jsdelivr\\.net\\/gh\\/TKPORL\\/mrhyfx@[^\\/]+\\/assets\\/[^"]+|(?:' + _bedRe + ')\\/[^"]+)', 'g'))].map(m => m[1]))].slice(0, 5)
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
<link rel="icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1" type="image/png">
<link rel="apple-touch-icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1">
</head>
<body>
<header>
  <div class="hwrap">
    <a class="site" href="index.html"><img src="eaffbcd6d2ab070b24071cff8b189ccf.png" alt="Tsinho黄油推荐站" class="site-logo"></a>
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
  <div class="sect"><h2>每日分享</h2><span>${days.length} 期</span><a class="dyx-btn" href="https://tkporl.github.io/hyfxdyx/" target="_blank" rel="noreferrer">单游戏站</a><a class="dyx-btn" href="https://yun.139.com/shareweb/#/w/i/2uR1zzgWrrPy9" target="_blank" rel="noreferrer" style="background:#e5484d;color:#fff;border-color:#e5484d">全部黄油（2w+）</a></div>
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

  // #28/#50/#51：底部导航行 =「← 上一期 ｜ 官网 全部黄油 解压教程 ｜ 下一期 →」。
  //   链序与首页一致（days 已按置顶在前+时间倒序）。求助贴 qzt 置顶且不是期数：上一期置灰、下一期指向最新一期；
  //   普通期帖之间按期数互链（上一期=更早一期，下一期=更新一期，不含 qzt）
  {
    const chain = days.filter(d => path.parse(d.file).name !== 'qzt');
    const navBtn = (href, label, disabled) => disabled
      ? `<span class="mrhx-btn mrhx-btn-nav" style="opacity:.35;cursor:default">${label}</span>`
      : `<a class="mrhx-btn mrhx-btn-nav" href="${esc(href)}">${label}</a>`;
    const navMid = NAV.map(n => `<a class="mrhx-btn mrhx-btn-nav" href="${esc(n.url)}" target="_blank" rel="noreferrer">${esc(n.label)}</a>`).join('\n    ');
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
<link rel="icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1" type="image/png">
<link rel="apple-touch-icon" href="${CDN_URL}/65ce15938559e6db9958d99b29e617c1.png?v=1">
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
  function renderMore() {
    var slice = _hits.slice(_page * ALL, (_page + 1) * ALL);
    resBox.insertAdjacentHTML('beforeend', slice.map(function (g) { return rowHtml(g, g._exact); }).join(''));
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
  if (!q) { countEl.textContent = ''; resBox.innerHTML = '<div class="empty-box"><h3>请使用上方搜索框搜索游戏</h3><p>输入游戏名称或关键词即可搜索</p><a class="btn-dl btn-dl-m" href="index.html" style="border:none;cursor:pointer">回到首页</a></div>'; document.getElementById('mrhx-more').style.display = 'none'; bindHistClick(); return; }
  fetch('search_index.json').then(function (r) { return r.json(); }).then(function (data) {
    if (!q) {
      // Direct access without query - show return to homepage message
      document.getElementById('mrhx-more').style.display = 'none';
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
  }).catch(function () { resBox.innerHTML = '<div class="empty-box"><h3>搜索索引加载失败</h3><p>请检查网络后刷新页面</p><a class="btn-dl btn-dl-m" href="javascript:location.reload()" style="border:none;cursor:pointer">重新加载</a> <a class="btn-dl btn-dl-m" href="index.html" style="border:none;cursor:pointer;margin-left:6px">回到首页</a></div>'; document.getElementById('mrhx-more').style.display = 'none'; });
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
