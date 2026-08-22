const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find first 3 nodes
const allMatches = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
if (allMatches) {
  allMatches.slice(0, 5).forEach((node, i) => {
    const titleMatch = node.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/);
    console.log(`Node ${i}:`, titleMatch ? titleMatch[1].slice(0, 60) : 'NO TITLE');
  });
}