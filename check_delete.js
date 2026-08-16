const fs = require('fs');

// Check deletePostComments logic
const ht = fs.readFileSync('Tsinhoht.html', 'utf8');
const deleteFunc = ht.substring(ht.indexOf('async function deletePostComments'), ht.indexOf('async function deletePostComments') + 500);
console.log('deletePostComments function:');
console.log(deleteFunc);

// Check what tag values look like for games vs posts
console.log('\n--- Checking postRepoPath function ---');
const pathFunc = ht.substring(ht.indexOf('function postRepoPath'), ht.indexOf('function postRepoPath') + 300);
console.log(pathFunc);
