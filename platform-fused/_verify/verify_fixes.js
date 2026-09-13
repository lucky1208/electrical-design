/* 修复验证：从修复后的真实网表确认 A1/A2 两个修复生效 */
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

const R = win.EVSE_ENGINE.build({
  pileName: '修复验证', standard: 'gb', archetype: 'dc-integrated',
  outputKw: 120, gunCount: 2, gunCurrentA: 250, moduleKw: 30,
  voltageWindow: '200-1000', thermal: 'air', essEnabled: false
});
const nets = R.design.nets;
const termNet = new Map();
nets.forEach((n) => (n.members || []).forEach((m) => {
  const k = m.instanceId + ':' + m.terminalId;
  if (!termNet.has(k)) termNet.set(k, []);
  termNet.get(k).push(n.id + '(' + n.name + ')');
}));
const netOf = (k) => (termNet.get(k) || []).join(',') || '[未连接]';

console.log('======== FIX-A1：辅助电源是否已在 KM1 上游 ========');
const km1Out = netOf('EQ-AC-KM1:OUT_L1');
const qfOut = netOf('EQ-AC-QF1:OUT_L1');
console.log('  KM1 主触点下游 L1 网络 : ' + km1Out);
console.log('  QF1 出口 L1 网络       : ' + qfOut);
['EQ-AUX-T1:AC_L1', 'EQ-AUX-T2:AC_L1', 'EQ-AUX-T1:AC_N', 'EQ-AUX-T2:AC_N'].forEach((k) => {
  const n = netOf(k);
  const ok = n.includes('QF1 后分支');
  console.log('  ' + k.padEnd(24) + ' -> ' + n + '   ' + (ok ? '✔ 已在上游' : '✘ 仍在下游'));
});
const stillDownstream = ['EQ-AUX-T1:AC_L1', 'EQ-AUX-T1:AC_N'].some((k) => netOf(k).includes('交流分配母线'));
console.log('  结论：辅助电源交流进线' + (stillDownstream ? '仍挂在 KM1 下游 ✘' : '已完全脱离 KM1 下游 ✔'));

console.log('\n======== FIX-A2：急停常闭触点是否串入 +24V 母线 ========');
const cC = netOf('EQ-CTL-SB1:CONTACT_C');
const cD = netOf('EQ-CTL-SB1:CONTACT_D');
const psu = netOf('EQ-AUX-T1:OUT_V24');
const bus = netOf('EQ-AUX-BUS:BUS24_V24');
console.log('  T1 输出 +24V          -> ' + psu);
console.log('  急停 CONTACT_C        -> ' + cC);
console.log('  急停 CONTACT_D        -> ' + cD);
console.log('  +24V 母线 WB4         -> ' + bus);
const km1Coil = netOf('EQ-AC-KM1:COIL_V24');
console.log('  KM1 线圈正端          -> ' + km1Coil);
const cNetC = (netOf('EQ-CTL-SB1:CONTACT_C').match(/NET-\d+/) || [])[0];
const cNetD = (netOf('EQ-CTL-SB1:CONTACT_D').match(/NET-\d+/) || [])[0];
const psuNet = (psu.match(/NET-\d+/) || [])[0];
const busNetId = (bus.match(/NET-\d+/) || [])[0];
const series = cNetC && cNetD && cNetC !== cNetD && cNetC === psuNet && cNetD === busNetId;
console.log('  串接判定：源侧网络=' + cNetC + ' 触点两侧网络=' + cNetC + '/' + cNetD + ' 母线网络=' + busNetId);
console.log('  ' + (series
  ? '✔ 已真正串入（两个独立网络，由急停常闭触点 C→D 桥接；断开即切断母线）'
  : '✘ 未串入'));

console.log('\n======== 交叉验证：切除急停后哪些负载失电 ========');
/* 24V 母线及其全部下游目标 */
const busNet = nets.find((n) => n.id === (bus.match(/NET-\d+/) || [])[0]);
if (busNet) {
  const targets = (busNet.members || []).map((m) => m.instanceId + ':' + m.terminalId).filter((k) => k !== 'EQ-CTL-SB1:CONTACT_D');
  console.log('  受急停硬线切断的 24V 端点共 ' + targets.length + ' 个，其中线圈类：');
  targets.filter((k) => /COIL_V24/.test(k)).forEach((k) => console.log('     - ' + k));
  const contactors = targets.filter((k) => /COIL_V24/.test(k)).length;
  console.log('  结论：急停动作将物理切除 ' + contactors + ' 个接触器线圈的正端供电 ' + (contactors > 0 ? '✔' : '✘'));
}

console.log('\n======== 剩余：SQ1 门禁 C/D 悬空可接受（required=false）========');
console.log('  EQ-CTL-SQ1:CONTACT_C -> ' + netOf('EQ-CTL-SQ1:CONTACT_C'));
console.log('  EQ-CTL-SQ1:CONTACT_D -> ' + netOf('EQ-CTL-SQ1:CONTACT_D'));
