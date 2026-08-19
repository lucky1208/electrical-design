/* 像素基线快照：重构前后输出必须逐字节一致 */
'use strict';
const crypto = require('crypto');
const { load, build } = require('./_load.js');
const win = load();
const CASES = [];
for (const standard of ['gb', 'eu', 'us'])
  for (const gunCount of [1, 2, 3, 4])
    for (const essEnabled of [true, false])
      for (const essCoupling of essEnabled ? ['dc', 'ac'] : ['dc'])
        for (const thermal of ['air', 'liquid'])
          CASES.push({ standard, gunCount, essEnabled, essCoupling, thermal });
const out = {};
CASES.forEach((o) => {
  const k = `${o.standard}_${o.gunCount}g_ess${o.essEnabled}_${o.essCoupling}_${o.thermal}`;
  out[k] = crypto.createHash('sha1').update(win.drawPile(build(win, o))).digest('hex').slice(0, 12);
});
console.log(JSON.stringify(out, null, 0));
