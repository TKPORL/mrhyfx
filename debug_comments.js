const fs = require('fs');
const https = require('https');

const KEY = 'sb_publishable_OfNqFNohTdrmzZ8dtu5bZQ_LcTk5iF9';
const SB = 'https://kydmccknlbpczeqppbtc.supabase.co';
const PATH = '/qzt.html';

// Test comment loading
function testComments() {
  var paths = [PATH];
  if (PATH.charAt(0) === '/') paths.push(PATH.slice(1));
  else paths.push('/' + PATH);
  
  console.log('Querying paths:', paths);
  
  const baseQ = SB + '/rest/v1/comments?select=id,pid,nick,is_admin,pinned,content,created_at&order=created_at.asc';
  
  return Promise.all(paths.map(function(p) {
    return new Promise(function(resolve) {
      const url = baseQ + '&url=eq.' + encodeURIComponent(p);
      const options = new URL(url);
      https.get({
        hostname: options.hostname,
        path: options.pathname + options.search,
        headers: {
          'apikey': KEY,
          'Authorization': 'Bearer ' + KEY
        }
      }, function(res) {
        let data = '';
        res.on('data', function(c) { data += c; });
        res.on('end', function() {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            resolve([]);
          }
        });
      }).on('error', function(e) {
        resolve([]);
      });
    });
  })).then(function(results) {
    var seen = {}, merged = [];
    results.forEach(function(r) {
      (r || []).forEach(function(c) {
        if (!seen[c.id]) { seen[c.id] = true; merged.push(c); }
      });
    });
    console.log('Merged total:', merged.length);
    merged.slice(0, 3).forEach(function(c) {
      console.log(' -', c.nick, ':', c.content.slice(0, 40));
    });
  });
}

// Check qzt.html comment section
const c = fs.readFileSync('qzt.html', 'utf8');
console.log('=== qzt.html Check ===');
console.log('Has comment div:', c.includes('id="mrhx-clist"'));
console.log('Has DOMContentLoaded:', c.includes('DOMContentLoaded'));
console.log('Has load(); call:', c.includes('load();'));

// Find the script that calls load()
const loadCallIdx = c.indexOf('load();');
console.log('load(); at index:', loadCallIdx);
console.log('Context:', c.substring(Math.max(0, loadCallIdx - 200), loadCallIdx + 50));

// Check if there's a second script (page view counter)
const scripts = c.match(/<script>[\s\S]*?<\/script>/g) || [];
console.log('\nTotal scripts:', scripts.length);
scripts.forEach((s, i) => {
  const short = s.replace(/\n/g, ' ').slice(0, 80);
  console.log(i + ':', short);
});

testComments();
