const fs = require('fs');
let content = fs.readFileSync('8.12pcaz.html','utf8');
function replaceGame(name, url) {
  const regex = new RegExp(`(<span>${name}<\\/span>[\s\S]*?src=")[^"]+(" )`);
  // using lazy match to find src within that block
  content = content.replace(regex, `$1${url}$2`);
}
replaceGame('蛇之交响曲', 'https://image.acg.lol/file/2026/01/08/4835357_11_Dsnow9.md.jpg');
replaceGame('痴迷的露西', 'https://image.acg.lol/file/2025/11/21/36020251121115349.png');
replaceGame('龙之鹿', 'https://image.acg.lol/file/2026/08/01/photo_5_2026-08-01_08-37-34.jpg');
replaceGame('苍色之光与魔剑锻造师', 'https://image.acg.lol/file/2025/11/29/photo_1_2025-11-28_21-10-23.jpg');
process.stdout.write(content);
