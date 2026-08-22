const fs = require('fs');
let html = fs.readFileSync('qzt.html', 'utf8');

// Remove the duplicate announcement node (keep only the first one)
const announcementRegex = /<li class="node heading3 node-full">[\s\S]*?免费帮找游戏\(纯公益\)[\s\S]*?<\/li>/g;
const matches = [...html.matchAll(announcementRegex)];
console.log('Found', matches.length, 'announcement nodes');

if (matches.length > 1) {
  // Remove the second occurrence
  let count = 0;
  html = html.replace(announcementRegex, (match) => {
    count++;
    if (count > 1) return '';
    return match;
  });
  fs.writeFileSync('qzt.html', html);
  console.log('Removed duplicate announcement node');
} else {
  console.log('No duplicate found');
}