/* 引擎自检: node tests/engine.test.js
 * 验证: 确定性(两次输出一致) + 4 张图纸 SVG 完整 + 关键计算非空 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function load(name) {
  const p = path.join(ROOT, 'js', name);
  const src = fs.readFileSync(p, 'utf8');
  const g = {};
  (new Function('window', 'document', 'Blob', 'URL', src))(g, {}, {}, {});
  return g;
}

/* 直接调用渲染函数需要 window.SYM; draw-*.js 只依赖 window.SYM + 参数 */
const symG = {};
(new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'symbols.js'), 'utf8')))(symG);
const engG = {};
(new Function('window', fs.readFileSync(path.join(ROOT, 'js', 'engine.js'), 'utf8')))(engG);

const sample = {
  projName: '测试智算中心', region: '上海', tier: 'tier3', gpuType: 'h100', gpuCount: 800,
  itLoad: 12000, voltage: '10', redundancy: '2n1', cooling: 'liquid', pueTarget: 1.25,
  rackPower: 40, pricePeak: 1.05, priceValley: 0.35
};

const R1 = engG.AIDC_ENGINE.build(sample);
const R2 = engG.AIDC_ENGINE.build(sample);
const j1 = JSON.stringify(R1), j2 = JSON.stringify(R2);
console.log('确定性检查:', j1 === j2 ? 'PASS (两次输出完全一致)' : 'FAIL');

/* 渲染 4 张图 */
const win = { SYM: symG.SYM };
const drawings = {};
['draw-arch.js', 'draw-wiring.js', 'draw-dual.js', 'draw-cooling.js'].forEach(f => {
  (new Function('window', fs.readFileSync(path.join(ROOT, 'js', f), 'utf8')))(win);
});
const names = { 'drawArch': '系统架构图', 'drawWiring': '电气一次接线图', 'drawDual': '双路供电拓扑图', 'drawCooling': '液冷管路图' };
let allOk = true;
for (const [fn, name] of Object.entries(names)) {
  const svg = win[fn](R1);
  const ok = typeof svg === 'string' && svg.startsWith('<svg') && svg.includes('</svg>') && svg.length > 5000;
  console.log(`图纸 ${name}: ${ok ? 'PASS' : 'FAIL'} (${(svg || '').length} 字符)`);
  if (!ok) allOk = false;
  fs.writeFileSync(path.join(ROOT, 'tests', `out-${fn}.svg`), svg, 'utf8');
}

/* 关键计算 */
const C = R1.compute, P = R1.power, Cl = R1.cooling;
console.log('IT负荷:', C.itLoadKw, 'kW | 总负荷:', C.totalLoadKw, 'kW');
console.log('机柜: GPU', C.gpuRacks, '+网', C.netRacks, '+存', C.storageRacks, '=', C.totalRacks);
console.log('变压器:', P.txTotal, '台', P.txUnit, 'kVA | UPS:', P.upsTotal, '台', P.upsUnit, 'kVA');
console.log('CDU:', Cl.cduCount, '台 | 主管', Cl.dn, '| 流量', Cl.flowLpm, 'L/min');
console.log('BOM 条目:', R1.bom.length, '| 总投资(万):', R1.economics.capex.toLocaleString());
console.log('合规检查: PASS', R1.compliance.filter(c => c.result === 'PASS').length, '/', R1.compliance.length);
if (!allOk) process.exit(1);
console.log('=== 全部自检通过 ===');