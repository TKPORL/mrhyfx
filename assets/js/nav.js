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
    if (window.matchMedia('(max-width: 680px)').matches) {
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

  // ===== 导航自适应（2026-10-06）=====
  // 原来收进「更多」完全靠写死的 540px/681px 媒体查询。菜单项一多（比如新增「赞助」到 6 项），
  // 541~1000px 这个区间就既没触发断点、又放不下，.menu 的 overflow:hidden 会把最后一项裁掉一半
  //（用户截图：赞助被切）。写死断点永远滞后于菜单项数量变化。
  // 现在改成：JS 实测菜单实际所需宽度，放不下就加 .nav-collapsed 切「更多」形态，
  // 放得下就恢复平铺。CSS 里 .nav-collapsed 优先于媒体查询，媒体查询作为无 JS 时的兜底。
  var bar = document.querySelector('.hd-bar');
  var menu = document.querySelector('.hd-bar .menu');
  // 克隆测量容器：绝对定位移出可视区，宽度按内容自然撑开，永不影响真实布局。
  // ⚠️ 必须挂在 .hd-bar 内部（2026-10-06 实测踩坑）：样式全靠 `.hd-bar .menu a` 这类后代选择器，
  //    探针若挂在 body 下，选择器不匹配 → 克隆出来的按钮是无样式小字，量出 292px
  //    而真实菜单是 690px，导致 need 严重偏小、永远判定「放得下」，收拢功能形同失效。
  var probe = null;
  function ensureProbe() {
    if (probe && probe.parentNode) return probe;
    probe = document.createElement('nav');
    probe.className = 'menu nav-probe';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;max-width:none;min-width:0;overflow:visible;flex:none;width:auto;display:flex;flex-wrap:nowrap;align-items:center;gap:1px;justify-content:flex-start;transition:none;transform:none;opacity:1';
    bar.appendChild(probe);
    return probe;
  }
  // 菜单项的自然宽度（不受窗口影响，量一次缓存住）
  var needCache = 0;
  function measureNeed() {
    var p = ensureProbe();
    // 只在菜单内容真的变了时才重建探针（2026-10-06 用户反馈「窗口缩放时页面一直抖」）：
    // 原实现每次 resize 都 p.innerHTML = menu.innerHTML，等于反复销毁重建 5 个链接节点，
    // 拖动窗口时每秒几十次，每次都触发样式重算 → 抖动。菜单项在一页内是静态的，用签名比对跳过。
    var links = menu.querySelectorAll('a');
    var sig = links.length + '|' + (links.length ? links[links.length - 1].getAttribute('href') : '');
    if (p.dataset.sig !== sig && links.length) {
      p.innerHTML = menu.innerHTML;
      p.dataset.sig = sig;
      // 逐项累加菜单项自身宽度，而不是量整体宽度：
      // 真实菜单是 justify-content:space-evenly，会把剩余空间摊到各项之间，
      // 整体宽度恒等于容器宽（量它永远等于「放得下」，2026-10-06 实测踩坑）。
      var items = p.querySelectorAll('a');
      var sum = 0;
      for (var i = 0; i < items.length; i++) {
        var w = items[i].getBoundingClientRect().width;
        if (w) sum += w;
      }
      var pg = parseFloat(getComputedStyle(p).columnGap || getComputedStyle(p).gap || '0') || 0;
      needCache = sum + pg * Math.max(0, items.length - 1);
    }
    return needCache;
  }

  function layoutNav() {
    if (!bar || !menu) return;
    // 2026-10-06 用户反馈「整页像从右闪到左」+「窗口缩放时页面一直抖」，老机型还卡。
    // 根因链：①早前靠 remove('nav-collapsed') 恢复平铺再量宽度 → 菜单真实参与布局 → 整页重排 → 闪；
    //      ②每次 resize 重建探针 DOM + 反复读 rect → 持续重排 → 抖。
    // 现在：菜单项自然宽度量一次就缓存，resize 时只算「可用宽度」这一个标量，不再碰任何 DOM。
    var need = measureNeed();
    if (!need) return;
    var others = 0;
    Array.prototype.forEach.call(bar.children, function (c) {
      if (c !== menu && c !== moreBtn && !c.classList.contains('nav-probe')) others += c.getBoundingClientRect().width;
    });
    var gap = parseFloat(getComputedStyle(bar).columnGap || getComputedStyle(bar).gap || '0') || 0;
    var usable = bar.clientWidth - others - gap * 2;
    // 迟滞阈值：留 4px 缓冲，宽度在临界点附近抖动时不会来回切换
    var shouldCollapse = need > usable + 4;
    if (shouldCollapse !== bar.classList.contains('nav-collapsed')) {
      bar.classList.toggle('nav-collapsed', shouldCollapse);
    }
  }
  layoutNav();
  // resize 节流：拖动窗口时 resize 会高频触发，用 rAF 保证每帧最多测一次（老机型友好）
  var resizePending = false;
  var resizeQuiet = false;
  window.addEventListener('resize', function () {
    if (resizePending) return;
    resizePending = true;
    // 拖动窗口期间临时关掉菜单收放过渡：临界点附近反复切换时，
    // 0.34s 的 transform/visibility 动画会一直重绘，视觉上就是「页面一直抖」（2026-10-06 用户反馈）。
    if (!resizeQuiet) {
      resizeQuiet = true;
      bar.classList.add('nav-resizing');
    }
    clearTimeout(resizeQuiet._t);
    resizeQuiet._t = setTimeout(function () {
      resizeQuiet = false;
      bar.classList.remove('nav-resizing');
    }, 220);
    requestAnimationFrame(function () {
      resizePending = false;
      layoutNav();
    });
  });
  // 字体/内容变化（如图片加载完）也会影响宽度，再测一次兜底
  window.addEventListener('load', layoutNav);

  // 跨断点时收起「更多」面板，避免按钮隐藏后菜单悬空 / 抽屉遮罩残留
  var mq = window.matchMedia('(min-width: 681px)');
  function onBreakpoint(e) { if (e.matches) { setMore(false); document.body.style.overflow = ''; } }
  if (mq.addEventListener) { mq.addEventListener('change', onBreakpoint); }
  else if (mq.addListener) { mq.addListener(onBreakpoint); }
})();
