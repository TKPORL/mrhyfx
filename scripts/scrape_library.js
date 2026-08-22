const fs = require('fs');
const path = require('path');

const PAGES_PER_CATEGORY = 5;

const CATEGORIES = [
  { name: 'PC', url: 'https://acgll.xyz/category/pc' },
  { name: 'AZ', url: 'https://acgll.xyz/category/az' },
];

const DELAY_MS = 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseArticles(html, category) {
  const articles = [];
  const parts = html.split(/<posts\s+class="posts-item/);
  
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];
    
    const titleMatch = chunk.match(/<h2\s+class="item-heading">\s*<a\s+href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/);
    if (!titleMatch) continue;
    const url = titleMatch[1];
    const title = titleMatch[2].replace(/\s+/g, ' ').trim();
    
    const imgMatch = chunk.match(/data-src="([^"]+)"/);
    const img = imgMatch ? imgMatch[1] : '';
    
    const tagMatches = [...chunk.matchAll(/<a\s+href="[^"]*\/tag\/([^"]*)"[^>]*class="but"[^>]*>\s*#\s*([^<]+)\s*<\/a>/g)];
    const tags = tagMatches.map(m => m[2].trim());
    
    const excerptMatch = chunk.match(/<div\s+class="item-excerpt[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const excerpt = excerptMatch ? excerptMatch[1].replace(/\s+/g, ' ').trim() : '';
    
    const authorMatch = chunk.match(/<span\s+class="hide-sm[^"]*"[^>]*>([^<]+)<\/span>/);
    const author = authorMatch ? authorMatch[1].trim() : '';
    
    const dateMatch = chunk.match(/<span\s+title="([^"]+)"\s+class="icon-circle">/);
    const date = dateMatch ? dateMatch[1] : '';
    
    const viewMatch = chunk.match(/<item\s+class="meta-view">[\s\S]*?<\/svg>\s*(\d+)/);
    const views = viewMatch ? parseInt(viewMatch[1]) : 0;
    
    const likeMatch = chunk.match(/<item\s+class="meta-like">[\s\S]*?<\/svg>\s*(\d+)/);
    const likes = likeMatch ? parseInt(likeMatch[1]) : 0;
    
    articles.push({ title, url, img, tags, excerpt, author, date, views, likes, category });
  }
  
  return articles;
}

async function scrapeCategory(cat) {
  console.log(`\nScraping: ${cat.name}`);
  const all = [];
  
  for (let page = 1; page <= PAGES_PER_CATEGORY; page++) {
    const url = page === 1 ? cat.url : `${cat.url}/page/${page}`;
    try {
      const html = await fetchPage(url);
      const articles = parseArticles(html, cat.name);
      console.log(`  Page ${page}: ${articles.length} articles`);
      all.push(...articles);
      if (page < PAGES_PER_CATEGORY) await sleep(DELAY_MS);
    } catch (e) {
      console.error(`  Page ${page} error: ${e.message}`);
      break;
    }
  }
  
  console.log(`  Total: ${all.length} articles`);
  return all;
}

async function main() {
  const allArticles = [];
  
  for (const cat of CATEGORIES) {
    try {
      const articles = await scrapeCategory(cat);
      allArticles.push(...articles);
    } catch (e) {
      console.error(`Error scraping ${cat.name}: ${e.message}`);
    }
  }
  
  const outputPath = path.join(__dirname, '..', 'library.json');
  fs.writeFileSync(outputPath, JSON.stringify(allArticles, null, 2), 'utf8');
  console.log(`\nSaved ${allArticles.length} articles to library.json`);
  
  const byCat = {};
  allArticles.forEach(a => { byCat[a.category] = (byCat[a.category] || 0) + 1; });
  console.log('Summary:', byCat);
}

main().catch(e => { console.error(e); process.exit(1); });
