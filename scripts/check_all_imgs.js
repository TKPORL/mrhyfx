const fs = require('fs');
const html = fs.readFileSync('8.21PC.html', 'utf8');
const allImgRefs = html.match(/src="[^"]*"/g);
console.log('All src refs:', allImgRefs ? allImgRefs.slice(0, 10) : 'none');