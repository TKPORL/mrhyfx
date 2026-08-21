const fs = require('fs');
const content = fs.readFileSync('scripts/gen.js', 'utf8');

const compressFunction = `
// compress all existing images in assets/ to webp (quality 80)
async function compressExistingAssets() {
  const assetsDir = 'assets';
  if (!fs.existsSync(assetsDir)) return;
  const entries = fs.readdirSync(assetsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = path.join(assetsDir, entry.name);
    const files = fs.readdirSync(subDir);
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext)) continue;
      const srcPath = path.join(subDir, file);
      const dstPath = path.join(subDir, path.parse(file).name + '.webp');
      // skip if webp already exists and is newer
      if (fs.existsSync(dstPath) && fs.statSync(dstPath).mtime >= fs.statSync(srcPath).mtime) continue;
      try {
        const buf = fs.readFileSync(srcPath);
        const compressed = await sharp(buf)
          .webp({ quality: 80, alphaQuality: 100, lossless: false })
          .toBuffer();
        fs.writeFileSync(dstPath, compressed);
        console.log('  compress', entry.name, file, \`-> \${path.parse(file).name}.webp (\${(buf.length/1024).toFixed(0)}KB -> \${(compressed.length/1024).toFixed(0)}KB)\`);
      } catch (e) {
        console.warn('  compress failed:', srcPath, e.message);
      }
    }
  }
}

`;

const callCode = `
  await compressExistingAssets();

  for (const file of files) {`;

const newContent = content
  .replace('const days = [];', compressFunction + 'const days = [];')
  .replace('  for (const file of files) {', callCode);

fs.writeFileSync('scripts/gen.js', newContent);
console.log('Done');