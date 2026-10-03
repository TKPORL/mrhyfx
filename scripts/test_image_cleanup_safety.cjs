const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const source = fs.readFileSync('scripts/gen.js', 'utf8');
const switchStart = source.indexOf('function switchMarkedNewImageUrls(html, tag) {');
const switchEnd = source.indexOf('\n}\n\nfunction extractLinks', switchStart) + 2;
assert(switchStart >= 0 && switchEnd > switchStart, 'URL switch function found');
const start = source.indexOf('async function cleanupMarkedRawImages() {');
const end = source.indexOf('\n}\n\n// （已撤销 #14', start) + 2;
assert(start >= 0 && end > start, 'cleanup function found');
const root = path.resolve('assets');
const entries = ['ok', 'original-used', 'webp-missing', 'bad-format'];
const files = new Set();
for (const name of entries) {
  const dir = path.resolve(root, name);
  files.add(path.resolve(dir, 'cover.jpg'));
  if (name !== 'webp-missing') files.add(path.resolve(dir, 'cover.webp'));
  files.add(path.resolve(dir, 'cover.jpg.mrhx-delete-after-webp'));
  if (name === 'ok') files.add(path.resolve(dir, 'cover.jpg.mrhx-new-upload'));
}
const removed = [];
const mockFs = {
  existsSync: p => p === root || entries.some(name => path.resolve(p) === path.resolve(root, name)) || files.has(path.resolve(p)),
  readdirSync(p) {
    if (path.resolve(p) === root) return entries.map(name => ({ name, isDirectory: () => true }));
    if (entries.some(name => path.resolve(p) === path.resolve(root, name))) {
      const names = ['cover.jpg.mrhx-delete-after-webp'];
      if (files.has(path.resolve(p, 'cover.jpg.mrhx-new-upload'))) names.push('cover.jpg.mrhx-new-upload');
      return names;
    }
    if (path.resolve(p) === path.resolve('.')) return ['a.html'];
    throw new Error('unexpected readdir: ' + p);
  },
  readFileSync(p) {
    if (String(p).endsWith('cover.jpg.mrhx-new-upload')) return Buffer.from('new-upload\n');
    if (path.basename(p) === 'a.html') return entries.map(name => `assets/${name}/cover.webp ${name === 'original-used' ? 'assets/original-used/cover.jpg' : ''}`).join(' ');
    if (String(p).endsWith('/cover.webp') || String(p).endsWith('\\cover.webp')) return Buffer.from(String(p).includes('bad-format') ? 'png' : 'webp');
    throw new Error('unexpected read: ' + p);
  },
  writeFileSync(p) { files.add(path.resolve(p)); },
  unlinkSync(p) { removed.push(path.resolve(p)); files.delete(path.resolve(p)); }
};
const ctx = { fs: mockFs, path, sharp: data => ({ metadata: async () => ({ format: data.toString() }) }), POST_DIR: '.', EXCLUDE: new Set(), safeAssetDir: name => path.resolve(root, name), console: { log() {}, warn() {} } };
vm.createContext(ctx);
vm.runInContext(source.slice(switchStart, switchEnd), ctx);
vm.runInContext(source.slice(start, end), ctx);
const switched = ctx.switchMarkedNewImageUrls('https://tkporl.github.io/mrhyfx/assets/ok/cover.jpg', 'ok');
assert.strictEqual(switched, 'assets/ok/cover.webp', 'marked source switches to existing WebP');
assert.strictEqual(ctx.switchMarkedNewImageUrls('https://tkporl.github.io/mrhyfx/assets/old/cover.jpg', 'old'), 'https://tkporl.github.io/mrhyfx/assets/old/cover.jpg', 'unmarked history stays unchanged');
ctx.cleanupMarkedRawImages().then(() => {
  assert(removed.includes(path.resolve(root, 'ok', 'cover.jpg')));
  assert(removed.includes(path.resolve(root, 'ok', 'cover.jpg.mrhx-delete-after-webp')));
  assert(removed.includes(path.resolve(root, 'ok', 'cover.jpg.mrhx-new-upload')));
  assert(files.has(path.resolve(root, 'ok', 'cover.webp.mrhx-new-upload')), 'new-upload marker moves to WebP');
  assert.deepStrictEqual(removed.sort(), [path.resolve(root, 'ok', 'cover.jpg'), path.resolve(root, 'ok', 'cover.jpg.mrhx-delete-after-webp'), path.resolve(root, 'ok', 'cover.jpg.mrhx-new-upload')].sort());
  console.log('通过：原图仅在 WebP 有效且页面已切换时清理；新图标记转到 WebP；其他情况均保留');
}).catch(error => { console.error(error); process.exitCode = 1; });
