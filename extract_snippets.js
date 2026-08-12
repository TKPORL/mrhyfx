const fs = require('fs');
const lines = fs.readFileSync('8.12pcaz.html','utf8').split(/\r?\n/);
function extract(start,end){
  console.log(lines.slice(start-1,end).join('\n'));
}
extract(1163,1172);
extract(1240,1248);
extract(1260,1267);
extract(1280,1285);
