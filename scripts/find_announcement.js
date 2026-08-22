const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find the announcement node (免费帮找游戏)
const announcementMatch = html.match(/<li class="node[^"]*heading3">[\s\S]*?免费帮找游戏[\s\S]*?<\/li>/);
if (announcementMatch) {
  console.log('Found announcement node');
  console.log('Classes:', announcementMatch[0].match(/class="([^"]+)"/));
} else {
  console.log('Announcement node not found');
}

// Find all nodes with 免费帮找游戏
const allMatches = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
if (allMatches) {
  allMatches.forEach((node, i) => {
    if (node.includes('免费帮找游戏')) {
      console.log(`Node ${i} has 免费帮找游戏`);
      console.log('Classes:', node.match(/class="([^"]+)"/));
    }
  });
}