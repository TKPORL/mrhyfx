#!/usr/bin/env node
/**
 * 把图床里的图片批量备份到仓库 assets/imgbed/
 *  - 压缩成 webp（quality 65）
 *  - 按图片内容算文件名：同一张图只存一份（自动去重）
 *  - 生成 assets/imgbed/_map.json：图床文件名 -> 仓库内文件名
 *
 * 用法：node scripts/backup_imgbed.js
 * 说明：图床挂了也能重复跑，已备份过的会跳过（靠 _map.json 记录）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'imgbed');
const MAP_FILE = path.join(OUT_DIR, '_map.json');
const QUALITY = 50;

// 图床域名，按顺序尝试（第一个能用就用它）
const IMGBED_BASES = [
  'https://tsinho.us.ci',
  'https://cloudflare-imgbed-e3b.pages.dev',
];

async function fetchList(base) {
  const auth = process.env.IMGBED_AUTHCODE || '';
  if (!auth) throw new Error('缺少图床管理密码（仓库 Secret: IMGBED_AUTHCODE）');
  const r = await fetch(`${base}/api/manage/list?authCode=${encodeURIComponent(auth)}`);
  if (!r.ok) throw new Error(`列表接口 HTTP ${r.status}`);
  const j = await r.json();
  return (j.files || []).map((f) => f.name);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const map = fs.existsSync(MAP_FILE)
    ? JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'))
    : {};

  let base = null;
  let names = [];
  for (const b of IMGBED_BASES) {
    try {
      const n = await fetchList(b);
      if (n && n.length) {
        base = b;
        names = n;
        break;
      }
    } catch (e) {
      console.warn('  × 列表拿不到:', b, e.message);
    }
  }
  if (!base) {
    console.error('\n图床列表取不到（检查 Secret IMGBED_AUTHCODE 是否已配置、密码是否正确）。');
    process.exit(1);
  }
  console.log(`\n图床 ${base} 共 ${names.length} 张\n`);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const name of names) {
    if (map[name]) {
      skip++;
      continue;
    }
    try {
      const r = await fetch(`${base}/file/${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const webp = await sharp(buf)
        .webp({ quality: QUALITY, alphaQuality: 100, lossless: false })
        .toBuffer();
      const hash = crypto.createHash('sha1').update(webp).digest('hex').slice(0, 20);
      const outName = hash + '.webp';
      const outPath = path.join(OUT_DIR, outName);
      if (!fs.existsSync(outPath)) fs.writeFileSync(outPath, webp);
      map[name] = outName;
      ok++;
      if (ok % 25 === 0) console.log(`  已处理 ${ok} 张…`);
    } catch (e) {
      fail++;
      console.warn('  × 失败:', name, e.message);
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
  const total = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.webp')).length;
  console.log(`\n完成：新增 ${ok}、跳过(已备份) ${skip}、失败 ${fail}`);
  console.log(`去重后仓库里共 ${total} 张图（原本图床 ${names.length} 张）`);
  console.log(`输出: assets/imgbed/   映射表: assets/imgbed/_map.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
