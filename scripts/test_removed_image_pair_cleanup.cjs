const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const source = fs.readFileSync('Tsinhoht.html', 'utf8');
const start = source.indexOf('async function cleanupRemovedGithubImages(repo, token, name, htmlContent, statusEl) {');
const end = source.indexOf('\n}\n\nasync function findRepoImageReferences', start) + 2;
assert(start >= 0 && end > start, 'cleanup function found');

async function runScenario(usedElsewhere) {
  const calls = [];
  const files = new Map([
    ['assets/demo/cover.jpg', { sha: 'raw' }],
    ['assets/demo/cover.webp', { sha: 'webp' }],
    ['assets/demo/cover.jpg.mrhx-new-upload', { sha: 'raw-mark' }],
    ['assets/demo/cover.jpg.mrhx-delete-after-webp', { sha: 'compress-mark' }],
    ['assets/demo/cover.webp.mrhx-new-upload', { sha: 'webp-mark' }]
  ]);
  const ctx = {
    URL,
    removedImageUrls: new Set(['https://tkporl.github.io/mrhyfx/assets/demo/cover.jpg']),
    apiGet: async (_repo, _token, imagePath) => files.get(decodeURIComponent(imagePath)) || null,
    apiDelete: async (_repo, _token, imagePath, sha) => { calls.push({ path: imagePath, sha }); files.delete(decodeURIComponent(imagePath)); },
    findRepoImageReferences: async () => new Set(usedElsewhere ? ['https://tkporl.github.io/mrhyfx/assets/demo/cover.jpg'] : [])
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  const deleted = await ctx.cleanupRemovedGithubImages('TKPORL/mrhyfx', 'unused', 'demo', '', null);
  return { calls, files, deleted };
}

async function runWebpScenario() {
  const calls = [];
  const files = new Map([
    ['assets/demo/cover.jpg', { sha: 'raw' }],
    ['assets/demo/cover.webp', { sha: 'webp' }],
    ['assets/demo/cover.jpg.mrhx-new-upload', { sha: 'raw-mark' }],
    ['assets/demo/cover.jpg.mrhx-delete-after-webp', { sha: 'compress-mark' }],
    ['assets/demo/cover.webp.mrhx-new-upload', { sha: 'webp-mark' }]
  ]);
  const ctx = {
    URL,
    removedImageUrls: new Set(['https://tkporl.github.io/mrhyfx/assets/demo/cover.webp']),
    apiGet: async (_repo, _token, imagePath) => files.get(decodeURIComponent(imagePath)) || null,
    apiDelete: async (_repo, _token, imagePath, sha) => { calls.push({ path: imagePath, sha }); files.delete(decodeURIComponent(imagePath)); },
    findRepoImageReferences: async () => new Set()
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(start, end), ctx);
  await ctx.cleanupRemovedGithubImages('TKPORL/mrhyfx', 'unused', 'demo', '', null);
  assert.deepStrictEqual(calls.map(x => x.path).sort(), [
    'assets/demo/cover.jpg', 'assets/demo/cover.webp',
    'assets/demo/cover.jpg.mrhx-delete-after-webp',
    'assets/demo/cover.jpg.mrhx-new-upload', 'assets/demo/cover.webp.mrhx-new-upload'
  ].sort(), 'WebP URL still cleans its marked original pair');
}

(async () => {
  const unused = await runScenario(false);
  assert.deepStrictEqual(unused.calls.map(x => x.path).sort(), [
    'assets/demo/cover.jpg', 'assets/demo/cover.webp',
    'assets/demo/cover.jpg.mrhx-delete-after-webp',
    'assets/demo/cover.jpg.mrhx-new-upload', 'assets/demo/cover.webp.mrhx-new-upload'
  ].sort());
  const referenced = await runScenario(true);
  assert.strictEqual(referenced.calls.length, 0, 'leave pair intact if another post references it');
  await runWebpScenario();
  console.log('通过：无人引用时清理新图原图/WebP/标记；其他帖子仍引用时全部保留；卡片仅保存 WebP 时也能清理带标记原图');
})().catch(error => { console.error(error); process.exitCode = 1; });
