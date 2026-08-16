const fs = require('fs');
const c = fs.readFileSync('qzt.html', 'utf8');

console.log('=== Checking comment script details ===');

// Find the comment script
const scriptMatch = c.match(/<script>\n\(function \(\) \{\s*var SB = 'https:\/\/kydmccknlbpczeqppbtc\.supabase\.co'/);
if (!scriptMatch) {
  console.log('Could not find comment script');
  process.exit(1);
}

const scriptStart = c.indexOf(scriptMatch[0]);
const scriptEnd = c.indexOf('</script>', scriptStart);
const commentScript = c.substring(scriptStart, scriptEnd + 9);

console.log('Script length:', commentScript.length);
console.log('Has fetch call:', commentScript.includes('fetch(SB'));
console.log('Has PATH var:', commentScript.includes('var PATH'));

// Find load() function
const loadFnIdx = commentScript.indexOf('function load() {');
if (loadFnIdx > 0) {
  console.log('\nload() function:');
  console.log(commentScript.substring(loadFnIdx, loadFnIdx + 500));
}

// Check for any obvious errors
console.log('\nChecking for JS errors:');
console.log('Has syntax error markers:', commentScript.includes('undefined'));
