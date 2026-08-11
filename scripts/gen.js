const fs = require('fs');
const files = fs.readdirSync('.');
const manual = '8月10黄油（PC+安卓）.html';
const src = fs.existsSync(manual) ? manual
  : files.filter(f => /黄油.*\.html$/.test(f)).sort().pop();
if (!src) { console.error('未找到原 HTML 导出文件'); process.exit(1); }
fs.copyFileSync(src, 'index.html');
console.log('index.html <-', src);