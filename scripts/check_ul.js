const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');

// Find the ul node-list
const ulMatch = html.match(/<ul class="node-list">/);
if (ulMatch) {
  console.log('Found ul at:', ulMatch.index);
  // Show context
  console.log(html.slice(ulMatch.index, ulMatch.index + 500));
}