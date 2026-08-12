const fs = require('fs');
const lines = fs.readFileSync('8.12pcaz.html','utf8').split(/\r?\n/);
lines.forEach((line,i)=>{ if(line.includes('img_01.png')) console.log(i+1+': '+line.trim());});
