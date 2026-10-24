// 全站丝滑滚动（tsinho-motion 配方 §1：Lenis 平滑滚动）
// - 只在「桌面 + 精确指针 + 未开启系统减弱动态效果」时启用；触屏直接走原生滚动
// - Lenis 驱动 window 原生滚动，sticky 顶栏 / 抽屉锁滚动（body overflow:hidden）不受影响
// - 两个手感旋钮：lerp（越小越跟手，越大越有余韵）、duration（滚到目标位的总时长）
(function () {
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (RM || !FINE || !globalThis.Lenis) return;

  var lenis = new Lenis({ lerp: 0.1, duration: 1.2, smoothWheel: true });
  // 2026-10-24：把实例挂到 window，供 nav.js 在抽屉打开时 stop()/start()。
  // Lenis 是直接驱动 window 滚动的，光靠 body{overflow:hidden} 拦不住它 ——
  // 不 stop 的话手机抽屉里滑动会让背后的页面跟着滚（站长反馈的真实 bug）。
  window.lenis = lenis;
  window.__mrhxLenis = lenis;
  // 先续订下一帧、再执行本帧（try/catch 兜底）：任何一帧 lenis.raf 抛异常，
  // 循环都不会永久停摆——否则 wheel 已被 Lenis 拦截但无人驱动滚动，整页会"定住"。
  function raf(t) {
    requestAnimationFrame(raf);
    try { lenis.raf(t); } catch (e) { console.error('[smooth] lenis frame error', e); }
  }
  requestAnimationFrame(raf);

  // 页内锚点平滑跳转（#xxx）；不逐帧写 history（file:// 下会抛异常打断滚动循环）
  // 2026-10-24 修复三处：
  //  ① 原来 href="#pwd" 的 indexOf('#') 也是 0，被判成「回顶部」→ 纯锚点全部失效；
  //  ② 原来对 tools.html#unzip 这类跨页锚点也 preventDefault，跨页跳转直接吃掉 → 只接 # 开头；
  //  ③ 原来 offset:70 方向反了（Lenis 的 offset 是加在目标位置上，正值=多滚=顶栏盖住标题），
  //     且没有考虑「一块内容能不能整块放进视口」。现在按内容高度决定居中还是顶部对齐。
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) !== '#') return; // 跨页链接（tools.html#x）一律放行
    var target = (href === '#' || href.length < 2) ? document.documentElement : document.querySelector(href);
    if (!target) return;
    e.preventDefault();

    var header = document.querySelector('header');
    var hh = (header ? header.offsetHeight : 0) + 16; // 顶栏高度 + 一点呼吸
    var vh = window.innerHeight;
    var th = target.offsetHeight || 0;
    // 目标距视口顶部要留多少：能整块放下就居中（上下都留白）；放不下整块时也别贴死顶栏，
    // 让出约 18% 视口高度，避免「划过头 / 标题被顶栏压住」的观感。
    // Lenis 的 offset 是「加在目标位置上的量」，所以取负值 = 让目标往下落。
    var lead;
    if (th && th <= vh - hh) {
      lead = Math.max(hh, Math.round((vh - th) / 2));
    } else {
      lead = Math.max(hh, Math.round(vh * 0.18));
    }
    lenis.scrollTo(target, { offset: -lead, duration: 0.7 });
  });
})();
