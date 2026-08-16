const fs = require('fs');

// Check cover images in index.html
const idx = fs.readFileSync('index.html', 'utf8');
const coverRe = /src="https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@main\/assets\/[^"]+"/g;
const covers = idx.match(coverRe) || [];
console.log('index.html cover images:', covers.length);
covers.slice(0, 5).forEach(c => console.log(' ', c.slice(0, 80)));

// Check if any logo.webp is used as cover
const logoRe = /logo\.webp/g;
const logos = idx.match(logoRe) || [];
console.log('logo.webp occurrences:', logos.length);

// Check qzt.html
const qzt = fs.readFileSync('qzt.html', 'utf8');
const qztCovers = qzt.match(coverRe) || [];
console.log('\nqzt.html asset images:', qztCovers.length);
qztCovers.slice(0, 3).forEach(c => console.log(' ', c.slice(0, 80)));

// Check if deletePostComments URL logic is correct
const ht = fs.readFileSync('Tsinhoht.html', 'utf8');
const urlLine = ht.match(/const url = isGame[^\n]+/);
console.log('\ndeletePostComments URL line:', urlLine ? urlLine[0] : 'not found');
