const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find all nodes
const allMatches = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
if (allMatches) {
  allMatches.forEach((node, i) => {
    const titleMatch = node.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/);
    if (titleMatch && titleMatch[1].includes('免费帮找')) {
      console.log(`Node ${i}:`, titleMatch[1].slice(0, 50));
      console.log('Classes:', node.match(/class="([^"]+)"/));
    }
  });
}