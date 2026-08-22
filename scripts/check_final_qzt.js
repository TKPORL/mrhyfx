const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find all nodes with heading3 (including node-full)
const allMatches = html.match(/<li class="node[^"]*heading3[^"]*">[\s\S]*?<\/li>/g);
if (allMatches) {
  allMatches.slice(0, 5).forEach((node, i) => {
    const titleMatch = node.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/);
    const classMatch = node.match(/class="([^"]+)"/);
    console.log(`Node ${i}: ${titleMatch ? titleMatch[1].slice(0, 60) : 'NO TITLE'}`);
    console.log('  Classes:', classMatch ? classMatch[1] : 'none');
  });
}

// Check comments PATH
const scriptMatch = html.match(/var PATH = '([^']+)'/);
if (scriptMatch) {
  console.log('\nComments PATH:', scriptMatch[1]);
}

// Check view script PATH
const viewMatch = html.match(/p_url: '([^']+)'/);
if (viewMatch) {
  console.log('View script PATH:', viewMatch[1]);
}