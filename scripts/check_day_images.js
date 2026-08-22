const fs = require('fs');
const html = fs.readFileSync('8.21PC.html', 'utf8');
const imgMatches = html.match(/src="(https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@main\/assets\/[^"]+)"/g);
console.log('8.21PC.html image refs:', imgMatches ? imgMatches.length : 0);
if (imgMatches) console.log(imgMatches.slice(0, 5));

// Also check for any image refs
const allImgRefs = html.match(/src="[^"]*"/g);
console.log('All src refs:', allImgRefs ? allImgRefs.length : 0);