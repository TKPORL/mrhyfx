const fs = require('fs');
const html = fs.readFileSync('8月10黄油（PC+安卓）.html', 'utf8');

const parts = html.split(/<li class="node/);
const entries = [];
const extras = [];
for (let i = 1; i < parts.length; i++) {
  const blockRaw = '<li class="node' + parts[i];
  const heading = /heading[1-3]/.test(blockRaw);
  const end = blockRaw.lastIndexOf('</li>');
  const liHtml = blockRaw.slice(0, end + 5);
  if (!heading) {
    const link = liHtml.match(/href="([^"]+)"[^>]*><span class="content-link-text">([^<]*)<\/span>/);
    if (link) extras.push({ label: link[2], url: link[1], liHtml });
    continue;
  }
  const content = liHtml.match(/<div class="content mm-editor"[^>]*>([\s\S]*?)<\/div>/);
  const img = liHtml.match(/src="(https:\/\/api2\.mubu\.com[^"]+)"/);
  const note = liHtml.match(/<div class="note mm-editor">([\s\S]*?)<\/div>/);
  if (!content) continue;
  const title = content[1].replace(/<[^>]+>/g, '').trim();
  const image = img ? img[1] : '';
  const noteHtml = note ? note[1] : '';
  const plain = noteHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const sizeMatch = plain.match(/(\d+(?:\.\d+)?\s?G)/);
  const tagMatch = plain.match(/^\[([^\]]+)\]/);
  const versionMatch = plain.match(/(内嵌AI汉化版|汉化步兵版|官中步兵版|官中版|汉化版|Steam官中步兵版)/);
  const cheatMatch = plain.match(/作弊码(\d+)/);
  const links = [];
  const linkRe = /<a class="content-link"[^>]*href="([^"]+)"[^>]*><span class="content-link-text">([^<]*)<\/span><\/a>/g;
  let lm;
  while ((lm = linkRe.exec(noteHtml)) !== null) {
    links.push({ label: lm[2], url: lm[1] });
  }
  entries.push({
    title,
    image,
    tags: tagMatch ? tagMatch[1].split('/').map(s => s.trim()).filter(Boolean) : [],
    version: versionMatch ? versionMatch[1] : '',
    size: sizeMatch ? sizeMatch[1] : '',
    cheat: cheatMatch ? cheatMatch[1] : '',
    links,
    liHtml
  });
}

fs.writeFileSync('games.json', JSON.stringify({ entries, extras }, null, 2), 'utf8');
console.log('games:', entries.length, 'extras:', extras.length);