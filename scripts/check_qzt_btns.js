const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');
const btns = html.match(/<a class="mrhx-btn[^"]*"[^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>/g);
console.log('Download buttons in qzt.html:', btns ? btns.length : 0);