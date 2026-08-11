const fs = require('fs');
const html = fs.readFileSync('8月10黄油（PC+安卓）.html', 'utf8');

const parts = html.split(/<li class="node/);
const entries = [];
for (let i = 1; i < parts.length; i++) {
  let block = '<li class="node' + parts[i];
  const heading = /heading[1-3]/.test(block);
  if (!heading) continue;
  const content = block.match(/<div class="content mm-editor"[^>]*>([\s\S]*?)<\/div>/);
  const img = block.match(/src="(https:\/\/api2\.mubu\.com[^"]+)"/);
  const note = block.match(/<div class="note mm-editor">([\s\S]*?)<\/div>/);
  if (!content) continue;
  const title = content[1].replace(/<[^>]+>/g, '').trim();
  const image = img ? img[1] : '';
  let noteText = note ? note[1] : '';
  const links = [];
  const linkRe = /<a class="content-link"[^>]*href="([^"]+)"[^>]*><span class="content-link-text">([^<]*)<\/span><\/a>/g;
  let lm;
  while ((lm = linkRe.exec(noteText)) !== null) {
    links.push({ label: lm[2], url: lm[1] });
  }
  const plain = noteText.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const sizeMatch = plain.match(/(\d+(?:\.\d+)?\s?G)/);
  const tagMatch = plain.match(/^\[([^\]]+)\]/);
  const versionMatch = plain.match(/(内嵌AI汉化版|汉化步兵版|官中步兵版|官中版|汉化版|Steam官中步兵版)/);
  const cheatMatch = plain.match(/作弊码(\d+)/);
  entries.push({
    title,
    image,
    tags: tagMatch ? tagMatch[1].split('/').map(s => s.trim()).filter(Boolean) : [],
    version: versionMatch ? versionMatch[1] : '',
    size: sizeMatch ? sizeMatch[1] : '',
    cheat: cheatMatch ? cheatMatch[1] : '',
    links
  });
}

const extras = [];
const extraRe = /<li class="node">([\s\S]*?)<\/li>/g;
let em;
while ((em = extraRe.exec(html)) !== null) {
  const link = em[1].match(/href="([^"]+)"[^>]*><span class="content-link-text">([^<]*)<\/span>/);
  if (link) extras.push({ label: link[2], url: link[1] });
}

fs.writeFileSync('games.json', JSON.stringify({ entries, extras }, null, 2), 'utf8');
console.log('games:', entries.length, 'extras:', extras.length);
