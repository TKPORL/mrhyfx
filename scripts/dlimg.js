const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('games.json', 'utf8'));
const { entries } = data;

const ASSETS = 'assets';
if (!fs.existsSync(ASSETS)) fs.mkdirSync(ASSETS);

const pad = n => String(n).padStart(2, '0');

(async () => {
  const map = {};
  for (let i = 0; i < entries.length; i++) {
    const url = entries[i].image;
    if (!url) continue;
    const name = `img_${pad(i + 1)}.png`;
    const file = path.join(ASSETS, name);
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, buf);
      map[url] = name;
      console.log('ok', name, buf.length, 'bytes');
    } catch (e) {
      console.log('FAIL', url, e.message);
    }
  }

  let html = fs.readFileSync('index.html', 'utf8');
  for (const [url, name] of Object.entries(map)) {
    html = html.split(url).join(`${ASSETS}/${name}`);
  }
  html = html.split('crossorigin="anonymous"').join('');
  fs.writeFileSync('index.html', html);
  console.log('index.html updated,', Object.keys(map).length, 'images localized');
})();
