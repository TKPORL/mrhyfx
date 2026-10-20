/* 解压码/作弊码：把介绍文本里的「解压码：xxx」「作弊码：xxx」移除，
   在下载按钮行（.mrhx-dl）末尾渲染成「解压码」「作弊码」按钮——点击即复制。 */
(function () {
  function enhance(scope) {
    (scope || document).querySelectorAll('.note.mm-editor, .result .intro').forEach(function (nt) {
      if (nt.getAttribute('data-codedone')) return;
      var sp = nt.querySelector(':scope > span') || nt;
      var html = sp.innerHTML || '';
      // 2026-10-19 修复：代码含「.」等符号（如 1435.kt）时旧正则 [A-Za-z0-9]+ 会截断，
      //   改为单趟替换同时收集三种码（解压/作弊/赞助）并从介绍里整段移除
      var found = { mz: null, zb: null, zz: null };
      // 2026-10-19 二次修复：码后面常跟【备注】（如「64762908【这版本…】」），旧模式遇空格即断导致复制不全。
      //   改为取到行尾，再用 cleanCode 去掉【】（）等备注块。
      // 2026-10-21 三修：码本身可能含空格（如「天生牛牛 或者 脸红红」），不再按空白截断，备注清洗后整段作为码；
      //   介绍里把「标签：码」整段移除（不再留残段）。
      function cleanCode(s) {
        return String(s || '').replace(/【[^】]*】|［[^］]*］|「[^」]*」|\([^)]*\)|（[^）]*）/g, ' ').trim();
      }
      var html2 = html.replace(/(?:\s*<br\s*\/?>)?\s*(解压码|作弊码|赞助码)[:：][ \t]*([^\n<]*)/g, function (m0, label, rest) {
        var key = label === '解压码' ? 'mz' : (label === '作弊码' ? 'zb' : 'zz');
        var code = cleanCode(rest);
        if (!code) return m0;
        if (!found[key]) found[key] = code;
        return ''; // 整行移除：码不该再留在介绍里（截断的残段也不行）
      });
      var mz = found.mz, zb = found.zb, zz = found.zz;
      if (!mz && !zb && !zz) return;
      nt.setAttribute('data-codedone', '1');
      sp.innerHTML = html2
        .replace(/\n\s*\n/g, '\n').replace(/^\s*\n/, '');
      var root = nt.closest('.node.heading3') || nt.closest('.result') || nt.parentElement;
      var dl = root ? root.querySelector('.mrhx-dl') : null;
      if (!dl) {
        dl = document.createElement('div'); dl.className = 'mrhx-dl';
        nt.insertAdjacentElement('afterend', dl);
      }
      if (mz) dl.insertAdjacentHTML('beforeend', '<button type="button" class="mrhx-unzip" data-code="' + mz + '" data-label="解压码">解压码</button>');
      if (zb) dl.insertAdjacentHTML('beforeend', '<button type="button" class="mrhx-cheat" data-code="' + zb + '" data-label="作弊码">作弊码</button>');
      if (zz) dl.insertAdjacentHTML('beforeend', '<button type="button" class="mrhx-sponsor" data-code="' + zz + '" data-label="赞助码">赞助码</button>');
    });
  }
  enhance(document);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.mrhx-unzip,.mrhx-cheat,.mrhx-sponsor') : null;
    if (!b) return;
    e.preventDefault();
    var code = b.getAttribute('data-code') || '';
    // 用 data-label 而不是 textContent：多个脚本副本时，后一个监听会读到前一个刚写的「已复制 ✓」，
    //   1.6 秒后把它写回去 → 按钮永久卡在「已复制 ✓」（2026-10-14 实测 qzt 有 21 个脚本副本）
    var label = b.getAttribute('data-label') || b.textContent;
    var done = function () {
      b.classList.add('ok'); b.textContent = '已复制 ✓';
      setTimeout(function () { b.classList.remove('ok'); b.textContent = label; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, function () { window.prompt('复制' + label + '：', code); });
    } else { window.prompt('复制' + label + '：', code); }
  });
})();


/* ===== 2026-10-14 「数据已丢失」标记（站长要求）=====
   背景：历史上有卡片在「草稿/表单与页面不同步」的保存路径里，把下载链接连同介绍一起丢了
   （发布器里现存同类事故注释：「草稿里是粘贴前的旧数据，恢复后链接会落到别的卡片上」），
   从 git 全历史 + 本地全部备份里都已无法还原（最早记录 09-20 就已是空的）。
   处理：不手工列名单，按规则自动显形 —— 卡片有封面但没有下载行 → 打上标记。
   好处：① 以后再丢会立刻在页面上可见，不再无声无息；
         ② 站长把链接补回去后，标记自动消失，不需要再改代码。 */
(function () {
  function markLost() {
    try {
      var cards = document.querySelectorAll('li.node.heading3, .node.heading3');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        if (card.getAttribute('data-lostdone')) continue;
        if (!card.querySelector('.image-list img, .image-row img')) continue;
        if (card.querySelector('.mrhx-dl')) { card.setAttribute('data-lostdone', '1'); continue; }
        var tag = document.createElement('span');
        tag.className = 'mrhx-lost';
        tag.textContent = '数据已丢失';
        tag.title = '这张卡的下载链接与介绍在历史数据里丢了，站长正在补档';
        var holder = card.querySelector('.content.mm-editor > span') || card.querySelector('.content > span') || card.querySelector('.content');
        if (holder) holder.appendChild(tag); else card.appendChild(tag);
        card.setAttribute('data-lostdone', '1');
      }
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', markLost); else markLost();
})();
