const fs = require('fs');
const h = fs.readFileSync('qzt.html', 'utf8');
const nodes = h.match(/<li class="node heading3">/g);
const fullNodes = h.match(/<li class="node heading3 node-full">/g);
console.log('Game nodes (heading3):', nodes ? nodes.length : 0);
console.log('Full nodes (node-full):', fullNodes ? fullNodes.length : 0);
console.log('Total:', (nodes ? nodes.length : 0) + (fullNodes ? fullNodes.length : 0));
