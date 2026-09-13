/* Tsinho黄油站 CDN 图片加载兜底（#15）：
 * 主源 gcore.jsdelivr.net（jsDelivr 官方中国线路）。个别访客网络下某个源可能不通，
 * 图片加载失败时自动换下一个 jsDelivr 官方镜像重试，每个源只试一次。
 * 正常情况本脚本零开销，只在 img error 事件触发时工作。 */
(function () {
  var HOSTS = [
    'https://gcore.jsdelivr.net',
    'https://cdn.jsdelivr.net',
    'https://fastly.jsdelivr.net',
    'https://testingcf.jsdelivr.net'
  ];
  function swap(img) {
    try {
      if (!img || img.tagName !== 'IMG') return;
      var src = img.currentSrc || img.src;
      if (!src || src.indexOf('jsdelivr.net/gh/TKPORL/mrhyfx') < 0) return;
      var tries = parseInt(img.getAttribute('data-cdn-try') || '0', 10);
      if (tries >= HOSTS.length) return;
      var cur = -1;
      for (var i = 0; i < HOSTS.length; i++) { if (src.indexOf(HOSTS[i]) === 0) { cur = i; break; } }
      var next = HOSTS[(cur < 0 ? 0 : cur + 1) % HOSTS.length];
      // 若算出的下一源与当前相同（cur 未知时），从第 2 源开始
      if (src.indexOf(next) === 0) next = HOSTS[1];
      img.setAttribute('data-cdn-try', String(tries + 1));
      img.src = next + src.replace(/^https:\/\/[^/]+/, '');
    } catch (e) {}
  }
  // error 事件不冒泡，用捕获阶段监听
  document.addEventListener('error', function (e) { swap(e.target); }, true);
  // 脚本延迟加载时可能已有图失败：补扫一遍
  function rescan() {
    var imgs = document.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.complete && im.naturalWidth === 0) swap(im);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rescan);
  else rescan();
})();
