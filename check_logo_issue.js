const fs = require('fs');

// Check index.html for any logo.webp in post cards
const idx = fs.readFileSync('index.html', 'utf8');

// Find all post cards
const postCards = idx.match(/<a class="post"[^>]*>[\s\S]*?<\/a>/g) || [];
console.log('Post cards found:', postCards.length);

// Check each post card for logo.webp
postCards.forEach((card, i) => {
  if (card.includes('logo.webp')) {
    console.log('Card', i, 'has logo.webp!');
    console.log('  Card content:', card.substring(0, 200));
  }
});

// Check the covers section
const coversMatch = idx.match(/class="covers"[^>]*>[\s\S]*?<\/div>/g) || [];
console.log('\nCovers sections:', coversMatch.length);
coversMatch.forEach((c, i) => {
  if (c.includes('logo.webp')) {
    console.log('Cover', i, 'has logo.webp!');
  }
});

// Check if there are any img tags with logo.webp outside header
const logoInContent = idx.match(/<img[^>]*logo\.webp[^>]*>/g) || [];
console.log('\nLogo.webp in img tags:', logoInContent.length);
logoInContent.forEach(l => console.log(' ', l.slice(0, 100)));
