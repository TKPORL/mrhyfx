#!/usr/bin/env node
/**
 * 由帖子 HTML 生成 APP 用的 app-games.json（只读页面、只写这一个文件）
 * 字段契约见 mrhyfx-app/README.md：
 *   { games: [{ id,title,cover,platform,size,tags,intro,linkPc,linkMobile,code,date }] }
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'app-games.json');
const EXCLUDE = new Set([
  'index.html', 'Tsinhoht.html', 'qzt.html', 'guide.html', 'tutorial.html', 'tools.html',
  '404.html', 'mianze.html', 'sponsor.html', 'email-preview.html', 'site-preview.html',
  'comments-preview.html', 'search.html', 'template-skeleton.html'
]);

function hashId(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h % 2000000000;
}
function strip(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
function dateOf(file) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(file);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function parseBlock(block, file, seq) {
  const titleM = /<div class="content mm-editor"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(block);
  const title = strip(titleM ? titleM[1] : '');
  if (!title) return null;

  const coverM = /data-full="([^"]+)"/.exec(block) || /<img[^>]+src="([^"]+)"/.exec(block);
  const cover = coverM ? coverM[1] : '';
  if (!cover) return null;

  const platM = /mrhx-plat-cover">([^<]*)</.exec(block);
  const platform = strip(platM ? platM[1] : '');

  const links = [];
  const re = /<a[^>]+class="[^"]*mrhx-btn[^"]*"[^>]*href="([^"]+)"/g;
  let m;
  while ((m = re.exec(block))) if (m[1] && !/^javascript:/i.test(m[1])) links.push(m[1]);

  const noteM = /<div class="note mm-editor"[^>]*>([\s\S]*?)<\/div>/.exec(block);
  const note = strip(noteM ? noteM[1] : '');

  const tags = [];
  const bracketRe = /【([^】]+)】/g;
  let bm;
  while ((bm = bracketRe.exec(note))) {
    bm[1].split(/[\/／、,，]/).map(x => x.trim()).filter(Boolean).forEach(t => {
      if (/^\d/.test(t)) return;
      if (t.length > 10) return;
      if (/^[A-Z]\d+$/.test(t)) return;
      if (/\d+(?:\.\d+)?\s*[GMT]B?/i.test(t)) return;
      if (t === '简介' || /^(PC|安卓|手机|双端)/.test(t)) return;
      tags.push(t);
    });
  }
  const sizeM = /(\d+(?:\.\d+)?)\s*([GMT])B?(?![A-Za-z])/i.exec(note);
  const size = sizeM ? sizeM[1] + sizeM[2].toUpperCase() : '';

  const codeM = /解压码[：:]\s*([^\s<【]+)/.exec(block);
  const code = codeM ? strip(codeM[1]) : '';

  return {
    id: hashId(file + '|' + title + '|' + seq),
    title,
    cover,
    platform,
    size,
    tags: [...new Set(tags)].slice(0, 6),
    intro: (note || title).slice(0, 110),
    linkPc: links[0] || '',
    linkMobile: links[1] || links[0] || '',
    code,
    date: dateOf(file)
  };
}

function main() {
  let ts = {};
  try { ts = JSON.parse(fs.readFileSync(path.join(ROOT, 'timestamps.json'), 'utf8')); } catch (e) {}
  const timeOf = f => {
    const k = f.replace(/\.html$/i, '');
    const v = ts[k];
    let t = v ? Date.parse(v) : NaN;
    if (isNaN(t)) {
      const m = /^(\d{4})(\d{1,2})(\d{2})/.exec(k);
      if (m) t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    }
    return isNaN(t) ? 0 : t;
  };
  const files = fs.readdirSync(ROOT)
    .filter(f => /\.html$/i.test(f) && !EXCLUDE.has(f))
    .sort((a, b) => (timeOf(b) - timeOf(a)) || (a < b ? 1 : -1));

  const games = [];
  for (const file of files) {
    let html;
    try { html = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch (e) { continue; }
    if (html.indexOf('class="node heading3') < 0) continue;
    const parts = html.split(/(?=<li class="node heading3)/).slice(1);
    for (const p of parts) {
      const g = parseBlock(p, file, games.length);
      if (!g) continue;
      // 不去重：同一游戏的不同版本（甚至同名不同版）都要保留
      g.uid = file.replace(/\.html$/i, '') + '#' + games.length;
      games.push(g);
    }
  }

  const payload = { updated: new Date().toISOString(), count: games.length, games };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log('app-games.json ok, games:', games.length);
  if (games.length) console.log('sample:', JSON.stringify(games[0]).slice(0, 300));
}

main();
