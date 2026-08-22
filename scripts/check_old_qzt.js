const { execSync } = require('child_process');
const html = execSync('git show 6eadd14:qzt.html', { encoding: 'utf8' });
const matches = html.match(/<li class="node[^"]*heading3">[\s\S]*?<\/li>/g);
if (matches) {
  matches.slice(0, 3).forEach((node, i) => {
    const m = node.match(/<div class="content mm-editor" ><span>([\s\S]*?)<\/span><\/div>/);
    console.log('Old Node', i, ':', m ? m[1].slice(0, 60) : 'NO TITLE');
    console.log('  Classes:', node.match(/class="([^"]+)"/));
  });
}