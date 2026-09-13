/* 验证 bom-library 的 kind 覆盖与冲突 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = 'D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed';
const E = path.join(ROOT, 'engine');
const { orderedEngineFiles } = require(path.join(ROOT, 'scripts', 'core-modules.js'));
const win = {};
orderedEngineFiles(E).forEach((f) => {
  (new Function('window', 'document', fs.readFileSync(path.join(E, f), 'utf8')))(win, {});
});
const lib = win.EVSE_BOM_KNOWLEDGE;
const kinds = Object.keys(win.EVSE_DEVICE_CATALOG.DEVICE_CLASSES);
console.log('device kind 总数 =', kinds.length);
console.log('知识库条目数   =', lib.ENTRIES.length);
console.log('已绑定 kind 数 =', lib.knownKinds().length);

const covered = lib.knownKinds();
const missing = kinds.filter((k) => !covered.includes(k));
const extra = covered.filter((k) => !kinds.includes(k));
console.log('\n未覆盖 kind (' + missing.length + '):');
missing.forEach((k) => console.log('   ' + k));
console.log('\n知识库中出现但 device-catalog 不存在 (' + extra.length + ') —— 必须是 0:');
extra.forEach((k) => console.log('   !! ' + k));

console.log('\n冲突检查：');
let conflicts = 0;
const seen = new Map();
lib.ENTRIES.forEach((e, i) => e.kinds.forEach((k) => {
  if (seen.has(k)) { console.log('   !! kind ' + k + ' 被条目 ' + seen.get(k) + ' 与 ' + i + ' 同时绑定'); conflicts++; }
  else seen.set(k, i);
}));
console.log('   冲突数 =', conflicts);

console.log('\nlinkKind 分布：');
const dist = {};
lib.ENTRIES.forEach((e) => { dist[e.linkKind] = (dist[e.linkKind] || 0) + 1; });
Object.keys(dist).forEach((k) => console.log('   ' + k.padEnd(14) + dist[k]));

console.log('\n价格字段泄漏检查（必须 0）：');
const leaked = lib.ENTRIES.filter((e) => Object.prototype.hasOwnProperty.call(e, 'price'));
console.log('   含 price 的条目 =', leaked.length);

console.log('\nURL 形态抽样：');
lib.ENTRIES.slice(0, 5).forEach((e) => console.log('   ' + String(e.tagHint).padEnd(10) + e.linkKind.padEnd(13) + e.referenceUrl));
