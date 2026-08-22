const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');
const notes = html.match(/<div class="note mm-editor">[\s\S]*?<\/div>/g);
if (notes) {
  notes.forEach((note, i) => {
    console.log('=== Note', i, '===');
    console.log(note.slice(0, 500));
    console.log('...');
  });
}