const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../evse-core.js');
require('../evse-geo.js');
require('../evse-render.js');
const R = global.window.EVSE_RENDER;

test('render escapes malicious ids, pins and paths from imported projects', () => {
  const dv = {
    id: 'X" onload="alert(1)', x: 0, y: 0,
    sym: {
      w: 40, h: 20,
      pins: [{ n: '1" onmouseover="alert(2)', x: 40, y: 10, d: 'E' }],
      draw: [['P', 'M 0 0" onload="alert(3)'], ['R', 0, 0, 10, 10, '2" onload="alert(9)']]
    }
  };
  const svg = R.devSVG(dv, { pinNo: true });
  assert.doesNotMatch(svg, /onload="|onmouseover="|onload='|onmouseover='/);
  assert.match(svg, /data-id="X&quot; onload=&quot;alert\(1\)"/);

  const design = {
    wires: [{ id: 'W" onload="alert(4)', cls: 'AC', net: 'N', sheet: 1, pts: [[0, 0], [10, 0]] }],
    hops: [], junctions: []
  };
  const ws = R.wiresSVG(design, 1, {});
  assert.doesNotMatch(ws, /onload="/);
  assert.match(ws, /data-id="W&quot; onload=&quot;alert\(4\)"/);
});

test('render coerces non-numeric geometry instead of injecting attributes', () => {
  const dv = {
    id: 'D1', x: '5" onload="alert(1)', y: 0, rot: '30" onload="alert(2)',
    sym: { w: '40" onload="alert(3)', h: 20, pins: [], draw: [['L', 'x', 'y', 1, 2]] }
  };
  const svg = R.devSVG(dv, {});
  assert.doesNotMatch(svg, /onload="/);
  const frame = R.frameSVG({
    sheets: [{ no: 1, title: 'T', frame: { x: '0" onload="alert(5)', y: 0, w: 100, h: 80 } }],
    params: { name: 'P' }, devices: [], nets: [], wires: []
  }, 1, {});
  assert.doesNotMatch(frame, /onload="/);
});