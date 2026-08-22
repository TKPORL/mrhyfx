const fs = require('fs');
let html = fs.readFileSync('qzt.html', 'utf8');

// 1. Fix first node: add node-full class for horizontal announcement
html = html.replace(
  '<li class="node heading3">\n    <div class="bullet">',
  '<li class="node heading3 node-full">\n    <div class="bullet">'
);

// 2. Fix comments PATH from /8.10.html to /qzt.html
html = html.replace(/var PATH = '\/8\.10\.html'/, "var PATH = '/qzt.html'");

// 3. Fix view script PATH too
html = html.replace(/p_url: '\/8\.10\.html'/, "p_url: '/qzt.html'");

fs.writeFileSync('qzt.html', html);
console.log('Fixed qzt.html');