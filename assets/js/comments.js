/* Tsinho黄油站 评论区公共脚本（#12：从每个帖子页内联 ~400 行抽成公共文件，走浏览器缓存）。
 * 唯一真相在本文件；由 scripts/gen.js 旧评论模板逐字迁移而来。
 * 页面在引用本文件之前内联配置：window.MRHXC = { sb, key, ns, path }；
 * 评论区 DOM 骨架（MRHX_SKELETON）由本脚本注入到自身标签之前。 */
var MRHX_SKELETON = "<!--mrhx-comments-->\n<div class=\"mrhx-comments\" id=\"mrhx-comments\">\n  <h2>评论区<span class=\"mrhx-cnum\" id=\"mrhx-cnum\"></span></h2>\n  <div class=\"mrhx-cfbar\" id=\"mrhx-cfbar\" style=\"display:none\"><button type=\"button\" class=\"mrhx-cfbtn\" id=\"mrhx-cfbar-btn\">缩短评论</button></div>\n  <div class=\"mrhx-cfold-wrap\" id=\"mrhx-cfold-wrap\">\n    <div id=\"mrhx-clist\"></div>\n    <div class=\"mrhx-cfold-mask\" id=\"mrhx-cfold-mask\"><button type=\"button\" class=\"mrhx-cfbtn\" id=\"mrhx-cfold-btn\">展开评论</button></div>\n  </div>\n  <div class=\"mrhx-cmore-wrap\" id=\"mrhx-cmore-wrap\" style=\"display:none\"><button type=\"button\" class=\"mrhx-cfbtn\" id=\"mrhx-cmore-btn\">加载更多评论</button></div>\n  <form id=\"mrhx-cform\" class=\"mrhx-cform\">\n    <div style=\"position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden\" aria-hidden=\"true\">\n      <label>请不要填写此栏<input type=\"text\" id=\"mrhx-hp\" name=\"website\" tabindex=\"-1\" autocomplete=\"off\"></label>\n    </div>\n    <div class=\"mrhx-cform-title\">💬 发表评论</div>\n    <div class=\"mrhx-crow\">\n      <input type=\"text\" id=\"mrhx-nick\" placeholder=\"昵称\" maxlength=\"30\" required>\n      <input type=\"email\" id=\"mrhx-mail\" placeholder=\"常用邮箱（站长回复会发到这里）\" required>\n    </div>\n    <textarea id=\"mrhx-ctext\" placeholder=\"友善评论，请支持正版…\" maxlength=\"2000\" required></textarea>\n    <div class=\"mrhx-crow mrhx-csub\">\n      <span id=\"mrhx-creply\" class=\"mrhx-creply\"></span>\n      <button type=\"submit\">发表评论</button>\n    </div>\n  </form>\n</div>\n<div class=\"mrhx-cpop\" id=\"mrhx-cpop\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"mrhx-cpop-title\">\n  <div class=\"mrhx-cpop-box\">\n    <h3 id=\"mrhx-cpop-title\">邮箱填写提示</h3>\n    <p>请填写您日常使用的电子邮箱地址。当网站管理员对您做出回复后，系统将自动把管理员的回复内容发送至您所填写的邮箱地址，以便您及时查收和查看回复信息。</p>\n    <button type=\"button\" class=\"mrhx-cpop-ok\" id=\"mrhx-cpop-ok\">知道了</button>\n  </div>\n</div>";
(function () {
  var C = window.MRHXC || {};
  if (!C.sb || !C.key || !C.path) return;
  document.currentScript.insertAdjacentHTML('beforebegin', MRHX_SKELETON);
  var SB = C.sb, KEY = C.key, PATH = C.path;
  var ADMIN = localStorage.getItem('mrhx_comments_admin') || '';
  var list = document.getElementById('mrhx-clist');
  var form = document.getElementById('mrhx-cform');
  var nickEl = document.getElementById('mrhx-nick'), mailEl = document.getElementById('mrhx-mail'), textEl = document.getElementById('mrhx-ctext');
  var hpEl = document.getElementById('mrhx-hp');
  var pop = document.getElementById('mrhx-cpop'), popOk = document.getElementById('mrhx-cpop-ok');
  var replyEl = document.getElementById('mrhx-creply');
  var foldWrap = document.getElementById('mrhx-cfold-wrap');
  var foldMask = document.getElementById('mrhx-cfold-mask');
  var foldBtn = document.getElementById('mrhx-cfold-btn');
  var cfbar = document.getElementById('mrhx-cfbar');
  var cfbarBtn = document.getElementById('mrhx-cfbar-btn');
  var moreWrap = document.getElementById('mrhx-cmore-wrap');
  var moreBtnEl = document.getElementById('mrhx-cmore-btn');
  var folded = true;
  // #39：折叠阈值由页面配置 MRHXC.fold 下发（site.json comments.foldThreshold，默认 6）
  var FOLD_MIN = (C.fold > 0 ? C.fold : 6);
  function applyFold() {
    if (!foldWrap) return;
    var need = all.length > FOLD_MIN;
    if (!need) {
      foldWrap.classList.remove('mrhx-cfolded');
      foldMask.classList.remove('mrhx-cfold-show');
      if (cfbar) cfbar.style.display = 'none';
      if (moreWrap) moreWrap.style.display = 'none';
      return;
    }
    if (folded) {
      foldWrap.classList.add('mrhx-cfolded');
      foldMask.classList.add('mrhx-cfold-show');
      foldBtn.textContent = '展开评论（' + totalCount() + ' 条）';
      if (cfbar) cfbar.style.display = 'none';
      if (moreWrap) moreWrap.style.display = 'none';
    } else {
      foldWrap.classList.remove('mrhx-cfolded');
      foldMask.classList.remove('mrhx-cfold-show');
      // 顶部 cfbar 只显示「缩短评论」
      if (cfbar) {
        cfbar.style.display = 'block';
        if (cfbarBtn) { cfbarBtn.disabled = false; cfbarBtn.textContent = '缩短评论'; }
      }
      // 底部 more-wrap：还有未加载→「加载更多评论」；已全量→隐藏
      if (moreWrap) {
        if (hasMore) {
          moreWrap.style.display = 'block';
          if (moreBtnEl) { moreBtnEl.disabled = false; moreBtnEl.textContent = '加载更多评论'; }
        } else {
          moreWrap.style.display = 'none';
        }
      }
    }
  }
  if (foldBtn) foldBtn.onclick = function () {
    // 两段式：展开只先展示已加载的 20 条（不拉全部），全部数据由下方「加载更多」按钮拉
    folded = false; applyFold();
  };
  if (cfbarBtn) cfbarBtn.onclick = function () {
    // 顶部按钮只有「缩短评论」功能
    folded = true; applyFold();
  };
  if (moreBtnEl) moreBtnEl.onclick = function () {
    // 底部按钮：一次性拉全部
    moreBtnEl.disabled = true; moreBtnEl.textContent = '加载中…';
    fetchPage(true, true);
  };
  var all = [];
  // 两段式分页：首次拉 20 条（秒开）；展开后点「加载更多评论」一次拉全部
  var PAGE = 20, offset = 0, hasMore = false, totalKnown = null;
  function totalCount() { return totalKnown != null ? totalKnown : all.length; }
  var popShown = false;
  if (pop) {
    mailEl.addEventListener('focus', function () { if (!popShown) { popShown = true; pop.classList.add('show'); } });
    pop.addEventListener('click', function (e) { if (e.target === pop) pop.classList.remove('show'); });
    popOk.addEventListener('click', function () { pop.classList.remove('show'); });
  }
  function h(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text) d.textContent = text; return d; }
  function headers() {
    // Prefer: count=exact 让 PostgREST 在 content-range 里返回真实总数（不带则尾部是 *，前端只能显示已加载数）
    return { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json', 'Prefer': 'count=exact' };
  }
  function render() {
    list.textContent = '';
    document.getElementById('mrhx-cnum').textContent = totalCount() ? '（' + totalCount() + ' 条）' : '';
    function buildRow(c) {
      var row = h('div', 'mrhx-citem' + (c.is_admin ? ' mrhx-citem-admin' : '') + (c.pid ? ' mrhx-creply-item' : ''));
      var head = h('div', 'mrhx-chead');
      head.appendChild(h('span', 'mrhx-cav' + (c.is_admin ? ' mrhx-cav-admin' : ''), String(c.nick || '匿')[0].toUpperCase()));
      var meta = h('div', 'mrhx-cmeta');
      meta.appendChild(h('b', '', c.nick || '匿名'));
      if (c.pid) {
        var parent = all.filter(function(p) { return p.id === c.pid; })[0];
        if (parent) meta.appendChild(h('span', 'mrhx-replyto', '回复 @' + (parent.nick || '匿名')));
      }
      if (c.is_admin) meta.appendChild(h('span', 'mrhx-cbadge', '站长'));
      if (c.pinned) meta.appendChild(h('span', 'mrhx-cbadge mrhx-cpin', '置顶'));
      meta.appendChild(h('span', 'mrhx-ctime', new Date(c.created_at).toLocaleString()));
      head.appendChild(meta);
      row.appendChild(head);
      row.appendChild(h('div', 'mrhx-ccontent', c.content));      var bar = h('div', 'mrhx-cbar');
      if (!c.pinned) {
      var rp = h('button', 'mrhx-cbtn', '回复');
      rp.type = 'button';
      rp.onclick = function () {
        var existForm = row.querySelector('.mrhx-cinline-form');
        if (existForm) { existForm.remove(); return; }
        document.querySelectorAll('.mrhx-cinline-form').forEach(function(f) { f.remove(); });
        var iform = document.createElement('div');
        iform.className = 'mrhx-cinline-form';
        var ihead = document.createElement('div');
        ihead.className = 'mrhx-cinline-head';
        ihead.appendChild(h('span', 'mrhx-cinline-to', '回复 @' + (c.nick || '匿名')));
        var xBtn = document.createElement('button');
        xBtn.type = 'button'; xBtn.className = 'mrhx-cinline-x'; xBtn.textContent = '取消';
        ihead.appendChild(xBtn);
        iform.appendChild(ihead);
        var ta = document.createElement('textarea');
        ta.placeholder = '回复 @' + (c.nick || '匿名') + '…';
        ta.maxLength = 2000;
        iform.appendChild(ta);
        var frow = document.createElement('div');
        frow.className = 'mrhx-cinline-row';
        var inick = document.createElement('input');
        inick.type = 'text'; inick.placeholder = '昵称'; inick.maxLength = 30;
        inick.value = localStorage.getItem('mrhx_nick') || '';
        var imail = document.createElement('input');
        imail.type = 'email'; imail.placeholder = '邮箱'; imail.value = localStorage.getItem('mrhx_mail') || '';
        var sendBtn = document.createElement('button');
        sendBtn.type = 'button'; sendBtn.className = 'mrhx-cinline-send'; sendBtn.textContent = '发送';
        var cancelBtn = document.createElement('button');
        cancelBtn.type = 'button'; cancelBtn.className = 'mrhx-cinline-cancel'; cancelBtn.textContent = '取消';
        frow.appendChild(inick); frow.appendChild(imail); frow.appendChild(sendBtn); frow.appendChild(cancelBtn);
        iform.appendChild(frow);
        bar.parentNode.insertBefore(iform, bar.nextSibling);
        ta.focus();
        imail.addEventListener('focus', function () { if (!popShown) { popShown = true; if (pop) pop.classList.add('show'); } });
        xBtn.onclick = function () { iform.remove(); };
        cancelBtn.onclick = function () { iform.remove(); };
        sendBtn.onclick = function () {
          var nick = inick.value.trim(), mail = imail.value.trim(), content = ta.value.trim();
          if (!nick || !mail || !content) { alert('请填写昵称、邮箱和内容'); return; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { alert('邮箱格式不正确'); return; }
          sendBtn.disabled = true; sendBtn.textContent = '发送中…';
          fetch(SB + '/rest/v1/rpc/guard_comment', {
            method: 'POST',
            headers: Object.assign(headers(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
            body: JSON.stringify({ p_url: PATH, p_nick: nick, p_email: mail, p_content: content, p_pid: c.id })
          }).then(function (r) {
            if (r.status === 404) throw new Error('评论防护服务尚未部署，请联系站长');
            if (!r.ok) return r.json().then(function (d) { throw new Error((d && (d.message || d.details)) || 'HTTP ' + r.status); });
            return r.json();
          }).then(function (d) {
            if (d && d.ok === false) throw new Error(d.error || '评论未通过检查');
            localStorage.setItem('mrhx_nick', nick);
            localStorage.setItem('mrhx_mail', mail);
            load();
            // 回复通知：已由 Supabase 触发器自动发邮件（supabase/upgrade_reply_notify.sql），前端不再持有密钥直调
          }).catch(function (e) { alert('发送失败：' + e.message); }).finally(function () { sendBtn.disabled = false; sendBtn.textContent = '发送'; });
        };
      };
      bar.appendChild(rp);
      }
      if (ADMIN) {
        var eb = h('button', 'mrhx-cbtn', '编辑');
        eb.type = 'button';
        eb.onclick = function () {
          var box = row.querySelector('.mrhx-cedit');
          if (box) { box.style.display = box.style.display === 'none' ? 'block' : 'none'; return; }
          var wrap = document.createElement('div');
          wrap.className = 'mrhx-cedit';
          wrap.style.cssText = 'margin-top:8px;padding:8px;background:#faf9f7;border-radius:8px;border:1px solid #e8e8e8';
          var ta = document.createElement('textarea');
          ta.value = c.content;
          ta.style.cssText = 'width:100%;min-height:50px;border:1px solid #ddd;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;resize:vertical';
          var saveBtn = h('button', 'mrhx-cbtn', '保存');
          saveBtn.type = 'button';
          saveBtn.style.cssText = 'margin-top:6px;margin-right:6px;background:#e5484d;color:#fff;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px';
          saveBtn.onclick = function () {
            var val = ta.value.trim();
            if (!val) { alert('内容不能为空'); return; }
            saveBtn.disabled = true; saveBtn.textContent = '保存中…';
            fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign(headers(), { 'x-admin-key': ADMIN, 'Prefer': 'return=minimal' }), body: JSON.stringify({ content: val }) })
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
              .catch(function (e) { alert('编辑失败：' + e.message); saveBtn.disabled = false; saveBtn.textContent = '保存'; });
          };
          var cancelBtn = h('button', 'mrhx-cbtn', '取消');
          cancelBtn.type = 'button';
          cancelBtn.style.cssText = 'margin-top:6px;background:#f0f0f0;color:#666;border:none;padding:5px 14px;border-radius:6px;cursor:pointer;font-size:12px';
          cancelBtn.onclick = function () { wrap.style.display = 'none'; };
          wrap.appendChild(ta);
          wrap.appendChild(saveBtn);
          wrap.appendChild(cancelBtn);
          row.appendChild(wrap);
        };
        bar.appendChild(eb);
        var dl = h('button', 'mrhx-cbtn mrhx-cdel', '删除');
        dl.type = 'button';
        dl.onclick = function () {
          if (!confirm('删除这条评论及其回复？')) return;
          fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'DELETE', headers: Object.assign(headers(), { 'x-admin-key': ADMIN }) })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
            .catch(function (e) { alert('删除失败：' + e.message); });
        };
        bar.appendChild(dl);
        if (!c.pid) {
          var pin = h('button', 'mrhx-cbtn', c.pinned ? '取消置顶' : '置顶');
          pin.type = 'button';
          pin.onclick = function () {
            fetch(SB + '/rest/v1/comments?id=eq.' + c.id, { method: 'PATCH', headers: Object.assign(headers(), { 'x-admin-key': ADMIN, 'Prefer': 'return=minimal' }), body: JSON.stringify({ pinned: !c.pinned }) })
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); load(); })
              .catch(function (e) { alert('置顶失败：' + e.message + '\n请先在 Supabase 运行 README 中的升级 SQL（comments 表添加 pinned 字段）。'); });
          };
          bar.appendChild(pin);
        }
      }
      row.appendChild(bar);
      return row;
    }
    function flatRender() {
      var depthMap = {};
      function getDepth(c) {
        if (depthMap[c.id] !== undefined) return depthMap[c.id];
        if (!c.pid) { depthMap[c.id] = 0; return 0; }
        var parent = all.filter(function(p) { return p.id === c.pid; })[0];
        depthMap[c.id] = parent ? getDepth(parent) + 1 : 0;
        return depthMap[c.id];
      }
      all.forEach(function(c) { getDepth(c); });
      function latestActivity(c) {
        var latest = c.created_at;
        all.forEach(function(r) { if (r.pid === c.id && r.created_at > latest) latest = r.created_at; });
        return latest;
      }
      var topLevel = all.filter(function(c) { return !c.pid; })
        .sort(function(a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || latestActivity(b).localeCompare(latestActivity(a)); });
      function renderChildren(parentId) {
        all.filter(function(r) { return r.pid === parentId; })
          .sort(function(a, b) { return b.created_at.localeCompare(a.created_at); })
          .forEach(function(r) {
            var d = depthMap[r.id] || 1;
            var row = buildRow(r);
            row.style.marginLeft = d > 0 ? '20px' : '';
            list.appendChild(row);
            renderChildren(r.id);
          });
      }
      topLevel.forEach(function(c) {
        list.appendChild(buildRow(c));
        renderChildren(c.id);
      });
    }
    flatRender();
    if (!all.length) list.appendChild(h('p', 'mrhx-cempty', '还没有评论，来说两句吧'));
    applyFold();
  }
  function fetchPage(reset, full) {
    if (reset) { list.innerHTML = '<p class="mrhx-loading">评论加载中...</p>'; offset = 0; totalKnown = null; }
    // 排序：置顶永远第一（折叠态也可见不被截断），其余按时间倒序
    var q = SB + '/rest/v1/comments?url=eq.' + encodeURIComponent(PATH) + '&select=id,pid,nick,email,is_admin,pinned,content,created_at&order=pinned.desc,created_at.desc' + (full ? '' : '&limit=' + PAGE + '&offset=' + offset);
    fetch(q, { headers: headers() })
      .then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('HTTP ' + r.status + (t ? '：' + t.slice(0, 200) : '')); });
        var cr = r.headers.get('content-range'); // 形如 0-19/269；CORS 未暴露时为 null
        if (cr) { var tot = parseInt(cr.split('/')[1], 10); if (!isNaN(tot)) totalKnown = tot; }
        return r.json();
      })
      .then(function (d) {
        d = d || [];
        if (full) { all = d; hasMore = false; }
        else {
          if (reset) all = d; else all = all.concat(d);
          offset += d.length;
          hasMore = totalKnown != null ? all.length < totalKnown : d.length === PAGE;
        }
        render();
      })
      .catch(function (e) { if (reset || full) list.textContent = '评论加载失败（' + e.message + '），请稍后再试'; else render(); });
  }
  function load() {
    fetchPage(true);
  }
  form.onsubmit = function (e) {
    e.preventDefault();
    if (hpEl && hpEl.value) { form.reset(); return; }
    var nick = nickEl.value.trim(), mail = mailEl.value.trim(), content = textEl.value.trim();
    if (!nick || !mail || !content) { alert('请填写昵称、邮箱和内容'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) { alert('邮箱格式不正确'); return; }
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = '发送中…';
    fetch(SB + '/rest/v1/rpc/guard_comment', {
      method: 'POST',
      headers: Object.assign(headers(), { 'Content-Type': 'application/json', 'Prefer': 'return=representation' }),
      body: JSON.stringify({ p_url: PATH, p_nick: nick, p_email: mail, p_content: content, p_pid: null })
    }).then(function (r) {
      if (r.status === 404) throw new Error('评论防护服务尚未部署，请联系站长');
      if (!r.ok) return r.json().then(function (d) { throw new Error((d && (d.message || d.details)) || 'HTTP ' + r.status); });
      return r.json();
    }).then(function (d) {
      if (d && d.ok === false) throw new Error(d.error || '评论未通过检查');
      form.reset();
      load();
      // 新评论通知站长：已由 Supabase 触发器自动发邮件（supabase/upgrade_notify_comment.sql），前端不再持有密钥直调
    }).catch(function (e) { alert('发送失败：' + e.message); }).finally(function () { btn.disabled = false; btn.textContent = '发表评论'; });
  };
  load();
})();
