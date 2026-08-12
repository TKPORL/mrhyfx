const fs = require('fs');
const lines = fs.readFileSync('8.12pcaz.html','utf8').split(/\r?\n/);
for(let i=0;i<lines.length;i++){
  if(lines[i].includes('<img')){
    console.log('--- line '+(i+1)+' ---');
    const start=Math.max(0,i-5);
    const end=Math.min(lines.length,i+5);
    for(let j=start;j<end;j++){
      console.log((j+1)+': '+lines[j].trim());
    }
    console.log('');
  }
}
