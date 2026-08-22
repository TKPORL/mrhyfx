const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find all nodes
const allMatches = html.match(/<li class="node[^"]*heading3[^"]*">[\s\S]*?<\/li>/g);
if (allMatches) {
  allMatches.slice(0, 5).forEach((node, i) => {
    const titleMatch = node.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/);
    const classMatch = node.match(/class="([^"]+)"/);
    console.log(`Node ${i}: ${titleMatch ? titleMatch[1].slice(0, 60) : 'NO TITLE'}`);
    console.log('  Classes:', classMatch ? classMatch[1] : 'none');
  });
}