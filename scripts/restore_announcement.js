const fs = require('fs');
const { execSync } = require('child_process');

// Get the original announcement node from old qzt.html
const oldHtml = execSync('git show 6eadd14:qzt.html', { encoding: 'utf8' });
const oldNodes = oldHtml.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
const announcementNode = oldNodes.find(n => n.includes('免费帮找游戏'));

// Add node-full class to make it horizontal announcement
const announcementWithFull = announcementNode.replace(
  '<li class="node heading3">',
  '<li class="node heading3 node-full">'
);

// Read current qzt.html
let html = fs.readFileSync('qzt.html', 'utf8');

// Find the first node in current qzt.html and prepend the announcement
const firstNodeMatch = html.match(/<li class="node heading3">/);
if (firstNodeMatch) {
  const insertPos = firstNodeMatch.index;
  html = html.slice(0, insertPos) + announcementWithFull + '\n' + html.slice(insertPos);
  fs.writeFileSync('qzt.html', html);
  console.log('Announcement node restored with node-full class');
} else {
  console.log('Could not find insertion point');
}