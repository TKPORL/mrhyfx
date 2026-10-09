// 全站统一顶部导航的交互：宽屏把菜单项铺开，窄屏（≤540px）收进「更多」按钮，
// 搜索点图标就地展开输入行。结构与样式见 scripts/gen.js 的 navHeaderHtml / NAV_CSS。
(function () {
  var searchBtn = document.querySelector('.hd-bar .search-btn');
  var moreBtn = document.querySelector('.hd-bar .more-btn');
  var searchDrop = document.getElementById('mrhxSearchDrop');
  var moreDrop = document.getElementById('mrhxMoreDrop');
  if (!searchBtn || !moreBtn || !searchDrop || !moreDrop) return;

  var searchInput = searchDrop.querySelector('input');
  var searchClose = searchDrop.querySelector('[data-nav-close]');
  var navMask = document.getElementById('mrhxNavMask');
  var drawerClose = moreDrop.querySelector('.drawer-close');

  function setSearch(open) {
    searchDrop.classList.toggle('open', open);
    searchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      setTimeout(function () { if (searchInput) searchInput.focus(); }, 60);
    }
  }

  function setMore(open) {
    moreDrop.classList.toggle('open', open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (navMask) navMask.classList.toggle('open', open);
    // 抽屉打开时锁住背景滚动（窄屏抽屉是全屏面板）
    if (window.matchMedia('(max-width: 900px)').matches) {
      document.body.style.overflow = open ? 'hidden' : '';
    }
  }

  function closeAll() { setSearch(false); setMore(false); }

  searchBtn.addEventListener('click', function () {
    var open = !searchDrop.classList.contains('open');
    closeAll();
    setSearch(open);
  });

  moreBtn.addEventListener('click', function () {
    var open = !moreDrop.classList.contains('open');
    closeAll();
    setMore(open);
  });

  if (searchClose) {
    searchClose.addEventListener('click', function () {
      setSearch(false);
      searchBtn.focus();
    });
  }

  if (drawerClose) {
    drawerClose.addEventListener('click', function () {
      setMore(false);
      moreBtn.focus();
    });
  }

  if (navMask) {
    navMask.addEventListener('click', function () { setMore(false); });
  }

  // 抽屉内非链接的空白区域也收起（遮罩被抽屉压在下面，点不到，只能在面板内空白处收起）
  moreDrop.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) return;
    setMore(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var wasSearch = searchDrop.classList.contains('open');
      closeAll();
      if (wasSearch) { searchBtn.focus(); } else { moreBtn.focus(); }
    }
  });

  document.addEventListener('click', function (e) {
    var inside = (e.target.closest && (e.target.closest('.hd-bar') || e.target.closest('.nav-drop')));
    if (!inside) { closeAll(); }
  });

  // 问题修复（2026-10-09）：header 带 backdrop-filter 时会成为 position:fixed 的包含块，
  // 导致手机端抽屉只在导航栏那一层渲染、遮罩盖不住整页。窄屏时把抽屉与遮罩移到 body 下。
  var mqMobile0 = window.matchMedia('(max-width: 900px)');
  function moveDrops() {
    var md = document.getElementById('mrhxMoreDrop');
    var mk = document.getElementById('mrhxNavMask');
    if (!md) return;
    if (mqMobile0.matches) {
      if (md.parentNode !== document.body) document.body.appendChild(md);
      if (mk && mk.parentNode !== document.body) document.body.appendChild(mk);
    } else {
      var hd = document.querySelector('header') || document.body;
      if (md.parentNode !== hd) hd.appendChild(md);
      if (mk && mk.parentNode !== hd) hd.appendChild(mk);
    }
  }
  window.addEventListener('load', moveDrops);
  document.addEventListener('DOMContentLoaded', moveDrops);
  moveDrops();
  if (mqMobile0.addEventListener) { mqMobile0.addEventListener('change', moveDrops); }
  else if (mqMobile0.addListener) { mqMobile0.addListener(moveDrops); }

  // 跨断点时收起「更多」面板，避免按钮隐藏后菜单悬空 / 抽屉遮罩残留
  var mq = window.matchMedia('(min-width: 901px)');
  function onBreakpoint(e) { if (e.matches) { setMore(false); document.body.style.overflow = ''; } }
  if (mq.addEventListener) { mq.addEventListener('change', onBreakpoint); }
  else if (mq.addListener) { mq.addListener(onBreakpoint); }
})();
