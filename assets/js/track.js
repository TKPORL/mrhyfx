/* Tsinho黄油站 浏览量 + 下载点击 公共统计脚本（#12：从帖子页内联抽出，走浏览器缓存）。
 * 唯一真相在本文件。页面在引用本文件之前内联配置：
 *   window.MRHXT = { sb: 'https://xxx.supabase.co', key: 'anonKey', path: '/xxx.html' } */
(function () {
  // 浏览量：防刷（同一访客同帖每天最多 3 次）+ inc_page_view / inc_daily_view
  try {
    var C = window.MRHXT || {};
    if (!C.sb || !C.key || !C.path) return;
    // #18：自动清理 30 天前的浏览标记，防 localStorage 越积越多
    try {
      var DAY = 86400000;
      var cutoff = new Date(Date.now() + 8 * DAY).toISOString().slice(0, 10);
      var c30 = new Date(Date.now() + 8 * DAY - 30 * DAY).toISOString().slice(0, 10);
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('mrhx_v_') === 0) keys.push(k);
      }
      for (var j = 0; j < keys.length; j++) {
        var m = keys[j].match(/^mrhx_v_(\d{4}-\d{2}-\d{2})_/);
        // 日期格式异常或早于 30 天前 → 删；cutoff 之后的（时钟偏差）也删
        if (!m || m[1] < c30 || m[1] > cutoff) localStorage.removeItem(keys[j]);
      }
    } catch (e) {}
    // 北京时间（UTC+8）切日，跟后台 bjDay() 口径一致，跨 0 点数据不漏算
    var day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    var k = 'mrhx_v_' + day + '_' + String(C.path).replace(/[^a-zA-Z0-9]/g, '_');
    var MAX = 3;
    var n = parseInt(localStorage.getItem(k) || '0', 10);
    if (isNaN(n)) n = 0;
    if (n >= MAX) return;
    localStorage.setItem(k, String(n + 1));
    var h = { 'apikey': C.key, 'Authorization': 'Bearer ' + C.key, 'Content-Type': 'application/json' };
    fetch(C.sb + '/rest/v1/rpc/inc_page_view', { method: 'POST', headers: h, body: JSON.stringify({ p_url: C.path }) })
      .then(function (r) { if (!r.ok) console.error('[view-track] inc_page_view HTTP', r.status); })
      .catch(function (e) { console.error('[view-track] inc_page_view', e); });
    fetch(C.sb + '/rest/v1/rpc/inc_daily_view', { method: 'POST', headers: h, body: JSON.stringify({ p_url: C.path, p_day: day }) })
      .then(function (r) { if (!r.ok) console.error('[view-track] inc_daily_view HTTP', r.status); })
      .catch(function (e) { console.error('[view-track] inc_daily_view', e); });
  } catch (e) { console.error('[view-track]', e); }
})();

(function () {
  // 下载按钮点击统计
  try {
    var C = window.MRHXT || {};
    if (!C.sb || !C.key || !C.path) return;
    var h = { 'apikey': C.key, 'Authorization': 'Bearer ' + C.key, 'Content-Type': 'application/json' };
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a.mrhx-btn-m,a.mrhx-btn-b,a.mrhx-btn-qk');
      if (!a) return;
      try {
        var game = a.closest('.node');
        var name = game ? game.querySelector('.content.mm-editor span') : null;
        // #11：优先读 data-type（生成时写入），旧页面无该属性时回退按 class 判断
        var type = a.getAttribute('data-type') || (a.classList.contains('mrhx-btn-m') ? 'mobile' : a.classList.contains('mrhx-btn-b') ? 'baidu' : 'custom');
        fetch(C.sb + '/rest/v1/download_clicks', { method: 'POST', headers: h, body: JSON.stringify({ post_url: C.path, game_name: name ? name.textContent.trim() : '', link_url: a.href, link_type: type, created_at: new Date().toISOString() }) }).then(function (r) { if (!r.ok) console.error('[dl-track] HTTP', r.status) }).catch(function (x) { console.error('[dl-track]', x) });
      } catch (x) { console.error('[dl-track]', x) }
    });
  } catch (x) { console.error('[dl-track]', x) }
})();

(function () {
  // #30：拉取本页累计浏览量显示在标题旁（独立于防刷逻辑，达到上限也要能看数字）
  try {
    var C = window.MRHXT || {};
    if (!C.sb || !C.key || !C.path) return;
    var el = document.getElementById('mrhx-views');
    if (!el) return;
    var h = { 'apikey': C.key, 'Authorization': 'Bearer ' + C.key };
    fetch(C.sb + '/rest/v1/page_views?select=count&url=eq.' + encodeURIComponent(C.path), { headers: h })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (d && d.length && typeof d[0].count === 'number') {
          el.textContent = ' · 已被浏览 ' + d[0].count.toLocaleString() + ' 次';
          el.style.display = '';
        } else { el.style.display = 'none'; }
      })
      .catch(function () { el.style.display = 'none'; });
  } catch (e) {}
})();

(function () {
  // 图片加载动效：卡片图未加载完时显示灰色占位+转圈（CSS :has 配合 .mrhx-img-loading），
  //   加载完成淡入、失败则直接显示 alt，不会永久转圈。不依赖任何配置，所有页面生效。
  try {
    function mark(img) {
      if (img.complete) return; // 已加载/已失败：不加占位态
      img.classList.add('mrhx-img-loading');
      img.addEventListener('load', function () { img.classList.remove('mrhx-img-loading'); });
      img.addEventListener('error', function () { img.classList.remove('mrhx-img-loading'); });
    }
    function run() {
      var imgs = document.querySelectorAll('img.image');
      for (var i = 0; i < imgs.length; i++) mark(imgs[i]);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  } catch (e) {}
})();
