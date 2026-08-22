const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');
// Find all node elements (game entries)
const nodes = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
if (nodes) {
  nodes.forEach((node, i) => {
    console.log('=== Node', i, '===');
    // Find the note and any download buttons in this node
    const noteMatch = node.match(/<div class="note mm-editor">[\s\S]*?<\/div>/);
    const btnMatches = node.match(/<a class="mrhx-btn[^"]*"[^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>/g);
    if (noteMatch) console.log('Note:', noteMatch[0].slice(0, 200));
    if (btnMatches) {
      console.log('Buttons:', btnMatches.length);
      btnMatches.forEach(btn => console.log('  ', btn.slice(0, 150)));
    }
    console.log('---');
  });
}