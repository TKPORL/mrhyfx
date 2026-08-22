const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Check first node
const firstNodeMatch = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/);
if (firstNodeMatch) {
  console.log('First node classes:', firstNodeMatch[0].match(/class="([^"]+)"/));
}

// Check comments PATH
const scriptMatch = html.match(/var PATH = '([^']+)'/);
if (scriptMatch) {
  console.log('Comments PATH:', scriptMatch[1]);
}

// Check view script PATH
const viewMatch = html.match(/p_url: '([^']+)'/);
if (viewMatch) {
  console.log('View script PATH:', viewMatch[1]);
}