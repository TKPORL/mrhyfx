const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
// Check each post entry for covers
const postMatches = html.match(/<a class="post"[\s\S]*?<\/a>/g);
if (postMatches) {
  postMatches.forEach((post, i) => {
    const hrefMatch = post.match(/href="([^"]+)"/);
    const imgMatch = post.match(/<div class="covers">[\s\S]*?<\/div>/);
    const titleMatch = post.match(/class="ptitle">([^<]+)/);
    console.log(`Post ${i}: ${titleMatch ? titleMatch[1] : 'unknown'} | href: ${hrefMatch ? hrefMatch[1] : 'none'} | covers: ${imgMatch ? 'YES' : 'NO'}`);
  });
}