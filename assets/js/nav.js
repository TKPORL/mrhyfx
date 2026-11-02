// 全站统一顶部导航的交互：宽屏把菜单项铺开，窄屏（≤540px）收进「更多」按钮，
// 搜索点图标就地展开输入行。结构与样式见 scripts/gen.js 的 navHeaderHtml / NAV_CSS。
(function () {
  var searchBtn = document.querySelector('.hd-bar .search-btn');
  var moreBtn = document.querySelector('.hd-bar .more-btn');
  var searchDrop = document.getElementById('mrhxSearchDrop');
  var moreDrop = document.getElementById('mrhxMoreDrop');
  // 2026-11-01（站长）：公告收纳按钮。公告被关掉（site.json 里 enabled:false）时这些元素不存在，
  // 所以不放进下面的 return 条件，后面全部按「有才处理」。
  var annBtn = document.querySelector('.hd-bar .ann-btn');
  var annDrop = document.getElementById('mrhxAnnDrop');
  if (!searchBtn || !moreBtn || !searchDrop || !moreDrop) return;

  /* ===== 2026-11-02 诊断模式（网址加 ?diag=1）=====
     安卓端「点搜索后自己关」连续几版都没定位到，停止猜测：把每次开关的调用栈直接打到屏幕上，
     用户操作几下截图即可看出是谁关的。不带 diag=1 时零开销。 */
  var DIAG = /[?&]diag=1/.test(location.search);
  function diag(tag, extra) {
    if (!DIAG) return;
    window.__DIAG = window.__DIAG || [];
    var st = '';
    try { st = (new Error().stack || '').split('\n').slice(1, 7).join(' <- ').replace(/\s+/g, ' '); } catch (e) {}
    window.__DIAG.push('[' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '] ' + tag + ' ' + (extra == null ? '' : extra) + '\n  ' + st);
    var btn = document.getElementById('__diagBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = '__diagBtn';
      btn.type = 'button';
      btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;padding:9px 14px;border-radius:22px;border:none;background:#111;color:#3f3;font:12px/1 monospace;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer';
      btn.onclick = function () {
        var head = 'URL: ' + location.href + '\nUA: ' + navigator.userAgent + '\nVIEW: ' + innerWidth + 'x' + innerHeight + '\n\n';
        var blob = new Blob([head + (window.__DIAG || []).join('\n\n')], { type: 'text/plain;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'nav-diag.txt';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 3000);
      };
      document.body.appendChild(btn);
    }
    btn.textContent = '日志 ' + window.__DIAG.length + ' 条 · 点此下载';
  }
  if (DIAG) {
    diag('init', 'w=' + innerWidth + ' h=' + innerHeight + ' vv=' + (window.visualViewport ? Math.round(visualViewport.height) : '?') + ' ua=' + navigator.userAgent.slice(0, 45));
    // 任何对搜索面板 class 的改动都记下来（能暴露不是本脚本干的关闭）
    new MutationObserver(function (ms) {
      ms.forEach(function () {
        diag('class', 'open=' + searchDrop.classList.contains('open') + ' h=' + searchDrop.offsetHeight);
      });
    }).observe(searchDrop, { attributes: true, attributeFilter: ['class'] });
    var _lv = '';
    window.addEventListener('resize', function () {
      var k = innerWidth + 'x' + innerHeight + '@' + (window.visualViewport ? Math.round(visualViewport.height) : '?');
      if (k === _lv) return;
      _lv = k;
      diag('resize', k);
    });
    searchDrop.addEventListener('focusin', function (e) { diag('focusin', e.target.tagName); });
    searchDrop.addEventListener('focusout', function (e) { diag('focusout', e.target.tagName); });
    window.addEventListener('scroll', function () { diag('scroll', Math.round(scrollY)); }, { passive: true });
  }

  var searchInput = searchDrop.querySelector('input');  var searchClose = searchDrop.querySelector('[data-nav-close]');
  var navMask = document.getElementById('mrhxNavMask');
  var drawerClose = moreDrop.querySelector('.drawer-close');

  // 2026-11-02（关键修复）：搜索浮层原来在 <header> 内，而 header 有 backdrop-filter，
  //   会形成包含块 → position:fixed 只相对顶栏那一小条定位，浮层内容被挤出视口（手机上只剩一片灰）。
  //   这里把它挪到 body 下，fixed 才真正相对视口。
  if (searchDrop && searchDrop.parentNode !== document.body) {
    document.body.appendChild(searchDrop);
  }

  // 记录最近一次展开时间：安卓上触摸后常有额外的 pointerdown，
  //   刚展开的 500ms 内一律不响应"点外部收起"，避免刚开就被自己关掉。
  var lastOpenAt = 0;
  // 触摸设备不自动聚焦：安卓弹出输入法会让视口重排，面板会被顶回去（苹果无此问题）
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  function setSearch(open) {
    // 刚打开的 500ms 内不接受关闭：安卓上偶发的重复点击/重排会把面板瞬间关掉
    if (!open && Date.now() - lastOpenAt < 500) { diag('setSearch-BLOCKED', 'age=' + (Date.now() - lastOpenAt)); return; }
    diag('setSearch', open);
    searchDrop.classList.toggle('open', open);
    searchBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      lastOpenAt = Date.now();
      if (!isTouch) {
        setTimeout(function () { if (searchInput) searchInput.focus(); }, 60);
      }
    }
  }

  function setMore(open) {
    diag('setMore', open);
    moreDrop.classList.toggle('open', open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (navMask) navMask.classList.toggle('open', open);
    if (open) lastOpenAt = Date.now();
    // 抽屉打开时锁住背景滚动（窄屏抽屉是全屏面板）
    document.body.style.overflow = open ? 'hidden' : '';
    // 2026-10-24（站长反馈「抽屉滑不动、滑了是页面在动」）：
    // Lenis 直接驱动 window 滚动，body{overflow:hidden} 拦不住它，必须显式 stop/start。
    // 2026-10-26 起 Lenis 已下线（站长要求去掉平滑滚动），页面里没有 window.__mrhxLenis，
    // 下面这段就成了空跑兜底 —— 留着是为了万一以后恢复平滑滚动不丢逻辑。
    // 抽屉内部 .drawer-body 仍有 data-lenis-prevent + overscroll-behavior:contain，
    // 原生滚动下后者才是真正起作用的那条。
    var L = window.__mrhxLenis || window.lenis;
    if (L && typeof L.stop === 'function') { if (open) L.stop(); else L.start(); }
  }

  function setAnn(open) {
    if (!annBtn || !annDrop) return;
    annDrop.classList.toggle('open', open);
    annBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    // 打开过就把弹窗关掉时留的红点撤掉
    if (open) annBtn.classList.remove('has-dot');
  }

  function closeAll() { diag('closeAll'); setSearch(false); setMore(false); setAnn(false); }

  // 2026-11-02：移动端一次触摸常常会连发两次 click（点击穿透 / 双击检测），
  //   toggle 逻辑会被抵消成「刚展开又自己缩回」。400ms 内的重复点击一律忽略。
  function guardToggle(fn) {
    var last = 0;
    return function (e) {
      var now = Date.now();
      if (now - last < 400) return;
      last = now;
      fn(e);
    };
  }

  searchBtn.addEventListener('click', guardToggle(function () {
    diag('click-search');
    var open = !searchDrop.classList.contains('open');
    closeAll();
    setSearch(open);   // 若在刚打开的 500ms 内，setSearch(false) 会被锁挡掉
  }));

  moreBtn.addEventListener('click', guardToggle(function () {
    diag('click-more');
    var open = !moreDrop.classList.contains('open');
    closeAll();
    setMore(open);
  }));

  // 2026-11-01（站长二次要求）：公告按钮不再展开下拉面板，而是直接唤起居中弹窗，
  // 关闭时弹窗会缩回这个按钮（见 gen.js 的 popupHtml / absorb）。
  if (annBtn) {
    // 没注入公告弹窗的页面（帖子页等）不显示这个按钮，避免点了没反应
    if (!document.getElementById('mrhxPopup')) annBtn.style.display = 'none';
    annBtn.addEventListener('click', guardToggle(function () {
      diag('click-ann-bar');
      closeAll();
      annBtn.classList.remove('has-dot');
      if (window.MRHX_ANN) window.MRHX_ANN.open();
    }));
  }

  // 2026-11-02：窄屏顶栏已隐藏公告按钮，入口在菜单抽屉顶部（.drawer-ann）
  var annDrawer = document.getElementById('mrhxAnnDrawer');
  if (annDrawer) {
    annDrawer.addEventListener('click', guardToggle(function () {
      setMore(false);
      if (window.MRHX_ANN) window.MRHX_ANN.open();
    }));
  }

  // 搜索浮层：点空白遮罩关闭；点输入框/按钮不关（2026-11-02 改浮层后加）
  if (searchDrop) {
    searchDrop.addEventListener('click', function (e) {
      if (e.target === searchDrop) setSearch(false);
    });
  }

  if (searchClose) {
    searchClose.addEventListener('click', function () {
      diag('click-x');
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
  // ★2026-11-02 修：原来只放过 <a>，点「其他资源」按钮（<button>）会被当成点空白 →
  //   抽屉直接关掉，而按钮自己又把列表展开，表现就是「再打开菜单发现已经展开、想收起又整只抽屉关了」。
  //   现在把整个 .drawer-res 区域（按钮 + 展开的列表）排除在外。
  moreDrop.addEventListener('click', function (e) {
    if (e.target.closest && (e.target.closest('a') || e.target.closest('.drawer-res'))) return;
    setMore(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var wasSearch = searchDrop.classList.contains('open');
      closeAll();
      if (wasSearch) { searchBtn.focus(); } else { moreBtn.focus(); }
    }
  });

  // 2026-11-02（站长手机端反馈「点搜索/菜单第一次会自己关、公告还会莫名被点到」）：
  //   面板展开会把 header 瞬间推高（grid 0fr→1fr），等 click 冒泡到 document 时，
  //   按钮已经位移、target 甚至落到内容区 → inside 判定失败 → closeAll() 把刚打开的面板关掉，
  //   表现为「第一次点无效、第二次才开」。
  //   改在 pointerdown（布局变化之前）就记下点击是否落在导航区/弹窗里，click 时用这个结果判断。
  // 2026-11-02：点导航/弹窗以外的位置 → 在 pointerdown 就收起。
  //   移动端 click 有延迟，面板展开又会把 header 推高，等 click 再判断容易错位；
  //   pointerdown 发生在布局变化之前，判定最准。
  document.addEventListener('pointerdown', function (e) {
    var t = e.target;
    if (t && t.closest && (t.closest('.hd-bar') || t.closest('.nav-drop') || t.closest('.mrhx-popup'))) return;
    if (Date.now() - lastOpenAt < 500) { diag('outside-pd-ignored', 'age=' + (Date.now() - lastOpenAt)); return; }   // 刚展开，这次触摸不算"点外面"
    diag('outside-pd', t && (t.tagName + '.' + String(t.className || '').slice(0, 24)));
    // 2026-11-02：只关抽屉，不关搜索。
    //   安卓点输入框会触发键盘/重排，历史上多次把搜索面板连带关掉；搜索只由按钮和「×」控制最稳。
    setMore(false);
  }, true);

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

  // 2026-10-26（站长反馈「窗口左右缩短再放大，整页变白，刷新才恢复」）：
  // 断点来回切时如果有 .open 状态的浮层没收回、或 body 的 overflow 锁没解开，
  // 页面会被残留在最上层的面板盖住。这里做兜底：缩放停下后统一收浮层 + 解滚动锁 + 重新归位抽屉。
  var _rszT = null;
  var _lastW = window.innerWidth;
  window.addEventListener('resize', function () {
    // ★2026-11-02 真因修复：安卓弹出输入法只改「视口高度」、不改宽度，
    //   原来任何 resize 都 closeAll()，于是「点输入框 → 键盘弹出 → 160ms 后搜索面板被兜底逻辑关掉」。
    //   兜底只为处理「窗口左右缩放」（宽度变化），所以宽度没变就直接跳过。
    var w = window.innerWidth;
    if (w === _lastW) return;
    _lastW = w;
    if (_rszT) clearTimeout(_rszT);
    _rszT = setTimeout(function () {
      closeAll();
      if (typeof moveDrops === 'function') moveDrops();
      document.body.style.overflow = '';
    }, 160);
  }, { passive: true });

  // ===== 「其他资源」下拉（2026-10-24）=====
  // 站长要求：鼠标滑过就展开、点一下也展开，资源像一条线铺开。
  // 注意：按钮与面板之间有约 10px 的空档（面板贴着 header 底边），
  //   指针穿过空档时 mouseleave 会先触发，所以不能立刻关，留 220ms 缓冲；
  //   面板本身在 .res-dd 内部，进去后会重新触发 mouseenter 把定时器清掉。
  var resDD = document.getElementById('mrhxResDD');
  var resBtn = resDD && resDD.querySelector('.res-btn');
  var resMenu = document.getElementById('mrhxResMenu');
  if (resDD && resBtn) {
    var resTimer = null;
    var resByClick = false;   // 是否由点击展开（悬停展开的不算）
    var setRes = function (open) {
      if (resTimer) { clearTimeout(resTimer); resTimer = null; }
      resDD.classList.toggle('open', open);
      resBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) resByClick = false;
    };
    resDD.addEventListener('mouseenter', function () { setRes(true); });
    resDD.addEventListener('mouseleave', function () {
      if (resTimer) clearTimeout(resTimer);
      resTimer = setTimeout(function () { setRes(false); }, 220);
    });
    // 悬停已经展开了，这时点一下不能把它关掉（站长要的是"点一下也展开"），
    // 所以只有「上一次也是点击展开的」才允许点关闭。
    resBtn.addEventListener('click', function (e) {
      e.preventDefault();
      if (resDD.classList.contains('open') && resByClick) { setRes(false); return; }
      setRes(true);
      resByClick = true;
    });
    if (resMenu) {
      resMenu.addEventListener('click', function () { setRes(false); });
    }
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#mrhxResDD')) setRes(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setRes(false);
    });
    // 缩放窗口时把资源面板收起：它的定位是相对 header 算的，跨断点后容易停在半空
    window.addEventListener('resize', function () { setRes(false); }, { passive: true });
  }

  // ===== 抽屉内「其他资源」折叠（2026-11-01 站长）=====
  // 手机端抽屉里原来是一排平铺的小卡，改成与上方菜单项同款的可折叠按钮，默认收起。
  var drawerRes = document.getElementById('mrhxDrawerRes');
  var drawerResBtn = drawerRes && drawerRes.querySelector('.drawer-res-btn');
  if (drawerRes && drawerResBtn) {
    drawerResBtn.addEventListener('click', function () {
      var open = drawerRes.classList.toggle('open');
      drawerResBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
})();
