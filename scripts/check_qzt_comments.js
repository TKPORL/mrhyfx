const fs = require('fs');
const html = fs.readFileSync('qzt.html', 'utf8');
// Find the comments script
const scriptMatch = html.match(/var PATH = '([^']+)'/);
if (scriptMatch) {
  console.log('Comments PATH:', scriptMatch[1]);
}
// Check for the viewScript call
const viewMatch = html.match(/inc_page_view.*?PATH = '([^']+)'/);
if (viewMatch) {
  console.log('View script PATH:', viewMatch[1]);
}