const fs = require('fs');
let html = fs.readFileSync('qzt.html', 'utf8');

// Find the second announcement node and remove it
const nodes = html.match(/<li class="node[^"]*heading3[^"]*">[\s\S]*?<\/li>/g);
if (nodes && nodes.length >= 2) {
  // Find positions of both announcement nodes
  let announcementCount = 0;
  let secondPos = -1;
  let secondLen = 0;
  
  const regex = /<li class="node[^"]*heading3[^"]*">[\s\S]*?<\/li>/g;
  let match;
  let count = 0;
  while ((match = regex.exec(html)) !== null) {
    if (match[0].includes('免费帮找游戏')) {
      count++;
      if (count === 2) {
        secondPos = match.index;
        secondLen = match[0].length;
        break;
      }
    }
  }
  
  if (secondPos >= 0) {
    html = html.slice(0, secondPos) + html.slice(secondPos + secondLen);
    fs.writeFileSync('qzt.html', html);
    console.log('Removed duplicate at position', secondPos);
  } else {
    console.log('Second announcement not found');
  }
}