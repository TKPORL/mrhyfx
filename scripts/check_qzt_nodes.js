const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find all nodes (game entries)
const nodes = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
if (nodes) {
  nodes.forEach((node, i) => {
    const titleMatch = node.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/);
    const btnMatch = node.match(/<div class="mrhx-dl">[\s\S]*?<\/div>/);
    console.log(`Node ${i}: ${titleMatch ? titleMatch[1].slice(0, 60) : 'NO TITLE'}`);
    if (btnMatch) {
      console.log(`  Has mrhx-dl: YES (${btnMatch[0].slice(0, 100)}...)`);
    } else {
      console.log(`  Has mrhx-dl: NO`);
    }
  });
}