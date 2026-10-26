// 页内锚点定位（全站）
// 2026-10-26（站长要求）：**去掉 Lenis 平滑滚动**，滚轮/触摸一律走浏览器原生滚动，
// 只保留这一件事——点页内锚点（#xxx）时按顶栏高度做偏移、并把目标块放到视口中间。
// 原生锚点跳转会把标题顶到视口最上、被 sticky 顶栏压住，这部分只能靠脚本算。
// Lenis 已不再加载（gen.js 的 SMOOTH_SCRIPTS 只剩本文件），window.__mrhxLenis 不再存在，
// nav.js 里那段 stop()/start() 是空跑兜底，不用管。
(function () {
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return; // 跨页链接（tools.html#x）一律放行
    var target = (href === '#' || href.length < 2) ? document.documentElement : document.querySelector(href);
    if (!target) return;
    e.preventDefault();

    if (target === document.documentElement) {
      window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
      return;
    }

    var header = document.querySelector('header');
    var hh = (header ? header.offsetHeight : 0) + 16; // 顶栏高度 + 一点呼吸
    var vh = window.innerHeight;
    var th = target.offsetHeight || 0;
    // 目标距视口顶部要留多少：能整块放下就居中（人的视觉主要看中间）；
    // 放不下整块时也让出约 18% 视口高度，避免「划过头 / 标题被顶栏压住」。
    var lead;
    if (th && th <= vh - hh) {
      lead = Math.max(hh, Math.round((vh - th) / 2));
    } else {
      lead = Math.max(hh, Math.round(vh * 0.18));
    }
    var absTop = target.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({
      top: Math.max(0, Math.round(absTop - lead)),
      behavior: RM ? 'auto' : 'smooth'
    });
  });
})();
