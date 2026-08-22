const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');
// Find all links
const links = html.match(/<a[^>]*href="[^"]*"[^>]*>[\s\S]*?<\/a>/g);
if (links) {
  links.forEach((link, i) => {
    console.log('=== Link', i, '===');
    console.log(link);
  });
}