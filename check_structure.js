const fs = require('fs');
const c = fs.readFileSync('qzt.html', 'utf8');

console.log('=== Checking qzt.html structure ===');

// Find script positions
const scripts = c.match(/<script>[\s\S]*?<\/script>/g) || [];
console.log('Number of scripts:', scripts.length);

// Find comment HTML positions
const commentHTMLStart = c.indexOf('<!--mrhx-comments-->');
const clistDiv = c.indexOf('id="mrhx-clist"');
const cformForm = c.indexOf('id="mrhx-cform"');

console.log('Comment HTML starts at:', commentHTMLStart);
console.log('clist div at:', clistDiv);
console.log('cform form at:', cformForm);

// Find script 2 position
let script2Start = -1;
for (let i = 0; i < scripts.length; i++) {
  if (scripts[i].includes('var SB =')) {
    script2Start = c.indexOf(scripts[i]);
    console.log('Script 2 (comment) starts at:', script2Start);
    console.log('Script 2 ends at:', script2Start + scripts[i].length);
    break;
  }
}

console.log('\n=== Order check ===');
console.log('Script before clist?', script2Start > 0 && script2Start < clistDiv);
console.log('clist before script?', clistDiv < script2Start);

// Check if load() is called
const hasLoadCall = c.includes('  load();\n})();');
console.log('\nHas load() call:', hasLoadCall);

// Check the actual script content near load()
const loadIdx = c.indexOf('  load();\n})();');
if (loadIdx > 0) {
  console.log('Context around load():');
  console.log(c.substring(loadIdx - 50, loadIdx + 50));
}
