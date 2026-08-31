// 该脚本已废弃。图片压缩功能已并入 scripts/gen.js，每次构建自动跑一次。
// 保留此文件仅为兼容老 README/脚本引用，跑它什么都不会发生。
const fs = require('fs');
const path = require('path');
// 仅校验根目录存在性（无任何文件读写、命令执行、网络请求）——纯白名单校验函数
function safeCheckRoot() {
  const root = path.resolve(__dirname, '..', 'assets');
  if (root.indexOf(path.resolve(__dirname, '..') + path.sep) !== 0) throw new Error('root 越界');
  return fs.existsSync(root);
}
console.log('add_compress_existing.js 已废弃；请直接跑 node scripts/gen.js。');
console.log('assets/ 目录存在:', safeCheckRoot() ? '是' : '否');
