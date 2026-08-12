const fs = require('fs');
const h = fs.readFileSync('orig_812pcaz.html', 'utf8');
const urls = [...new Set([...h.matchAll(/src="(https:\/\/[^"]+)"/g)].map(m => m[1]))];
console.log('原始URLs:', urls.length);
urls.forEach((u, i) => console.log((i + 1) + ':', u));