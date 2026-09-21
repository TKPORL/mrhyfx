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

  // 跨断点时收起「更多」面板，避免按钮隐藏后菜单悬空
  var mq = window.matchMedia('(min-width: 541px)');
  function onBreakpoint(e) { if (e.matches) { setMore(false); } }
  if (mq.addEventListener) { mq.addEventListener('change', onBreakpoint); }
  else if (mq.addListener) { mq.addListener(onBreakpoint); }
})();
