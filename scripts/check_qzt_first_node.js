const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find first node
const firstNodeMatch = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/);
if (firstNodeMatch) {
  console.log('First node classes:', firstNodeMatch[0].match(/class="([^"]+)"/));
  console.log('First 500 chars:', firstNodeMatch[0].slice(0, 500));
}

// Check for comments section
console.log('\nHas mrhx-comments:', html.includes('mrhx-comments'));
console.log('Has mrhx-clist:', html.includes('mrhx-clist'));
console.log('Has mrhx-cnum:', html.includes('mrhx-cnum'));