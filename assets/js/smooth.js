// 全站丝滑滚动（tsinho-motion 配方 §1：Lenis 平滑滚动）
// - 只在「桌面 + 精确指针 + 未开启系统减弱动态效果」时启用；触屏直接走原生滚动
// - Lenis 驱动 window 原生滚动，sticky 顶栏 / 抽屉锁滚动（body overflow:hidden）不受影响
// - 两个手感旋钮：lerp（越小越跟手，越大越有余韵）、duration（滚到目标位的总时长）
(function () {
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (RM || !FINE || !globalThis.Lenis) return;

  var lenis = new Lenis({ lerp: 0.1, duration: 1.2, smoothWheel: true });
  function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  // 页内锚点平滑跳转（#xxx）；不逐帧写 history（file:// 下会抛异常打断滚动循环）
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var id = href.indexOf('#');
    if (id < 0) return;
    var target = id === 0 ? document.documentElement : document.querySelector(href.slice(id));
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: 70 });
  });
})();
