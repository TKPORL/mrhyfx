const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');
// Find the parent elements of download buttons
const btnRegex = /<a class="mrhx-btn[^"]*"[^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>/g;
let match;
while ((match = btnRegex.exec(html)) !== null) {
  const pos = match.index;
  // Get surrounding context (500 chars before and after)
  const start = Math.max(0, pos - 500);
  const end = Math.min(html.length, pos + match[0].length + 500);
  const context = html.slice(start, end);
  console.log('=== Button at position', pos, '===');
  console.log(context);
  console.log('---');
  // Only show first 5
  if (pos > 10000) break;
}