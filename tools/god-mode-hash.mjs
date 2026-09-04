#!/usr/bin/env node
/* ============================================================
   生成「专属特权」口令摘要：salt + sha256(salt + 口令)
   ------------------------------------------------------------
   用法：node tools/god-mode-hash.mjs <口令>
   输出：{ "salt": "...", "hash": "..." }（填进 assets/data/god-mode.json 的 unlock 块）

   说明：
   - 口令只参与内存计算，不写入任何文件、不进版本库。
   - 命令行参数会进入 shell history，用完建议清理历史；
     或者改成本脚本交互式读取（把口令直接贴到提示后）。
   ============================================================ */
import { createHash, randomBytes } from 'node:crypto';

const pw = process.argv[2];

if (!pw) {
  console.error('用法: node tools/god-mode-hash.mjs <口令>');
  console.error('示例: node tools/god-mode-hash.mjs my-secret-pass');
  process.exit(1);
}

if (pw.length < 8) {
  console.error('⚠️  口令短于 8 位，抗爆破能力弱，建议换更长的口令。');
}

const salt = 'pp-' + randomBytes(6).toString('hex');
const hash = createHash('sha256').update(salt + pw, 'utf8').digest('hex');

console.log(JSON.stringify({ salt, hash }, null, 2));
console.error('\n把上面两行填进 assets/data/god-mode.json 的 unlock.salt / unlock.hash 即可。');
