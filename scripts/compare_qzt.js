const fs = require('fs');
const oldHtml = require('child_process').execSync('git show 6eadd14:qzt.html', { encoding: 'utf8' });
const newHtml = fs.readFileSync('qzt.html', 'utf8');

// Find download buttons in both
const oldBtns = (oldHtml.match(/mrhx-btn/g) || []).length;
const newBtns = (newHtml.match(/mrhx-btn/g) || []).length;

console.log('Old qzt.html mrhx-btn count:', oldBtns);
console.log('New qzt.html mrhx-btn count:', newBtns);

// Check for comments script
console.log('Old has comments:', oldHtml.includes('mrhx-comments'));
console.log('New has comments:', newHtml.includes('mrhx-comments'));

// Check for view script
console.log('Old has inc_page_view:', oldHtml.includes('inc_page_view'));
console.log('New has inc_page_view:', newHtml.includes('inc_page_view'));

// Size comparison
console.log('Old size:', oldHtml.length);
console.log('New size:', newHtml.length);