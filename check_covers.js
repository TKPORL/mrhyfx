const fs = require('fs');

// Check for posts with non-CDN images or missing images
const files = ['1.html', '30.html', '8.1.1.html', '8.10.html', '8.11.html', '8.12PC.html', '8.12pcaz.html', 'qzt.html'];

files.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  // Find all src attributes
  const allSrc = c.match(/src="([^"]+)"/g) || [];
  const cdnAssets = c.match(/src="https:\/\/cdn\.jsdelivr\.net\/gh\/TKPORL\/mrhyfx@main\/assets\/[^"]+"/g) || [];
  const logos = c.match(/logo\.webp/g) || [];
  
  console.log(f + ':');
  console.log('  Total src:', allSrc.length);
  console.log('  CDN assets:', cdnAssets.length);
  console.log('  Logo.webp:', logos.length);
  
  // Check for non-CDN, non-logo images
  const otherImgs = allSrc.filter(s => !s.includes('cdn.jsdelivr.net') && !s.includes('logo.webp'));
  if (otherImgs.length > 0) {
    console.log('  Other images:', otherImgs.slice(0, 3));
  }
  console.log('');
});

// Check search_index.json for missing images
console.log('--- Checking search_index.json ---');
const si = JSON.parse(fs.readFileSync('search_index.json', 'utf8'));
const noImg = si.filter(g => !g.img);
console.log('Games without img:', noImg.length);
if (noImg.length > 0) {
  console.log('Samples:', noImg.slice(0, 3).map(g => g.title));
}
