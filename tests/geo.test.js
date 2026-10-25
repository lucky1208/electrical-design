const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../evse-geo.js');
const G = global.window.EVSE_GEO;

function design(wires, devices) {
  const map = {};
  (devices || []).forEach(d => map[d.id] = d);
  return { wires, devices: devices || [], map, nets: [], sheets: [{ no: 1 }], junctions: [], hops: [] };
}

test('dragSegment moves the selected run and cascades a movable neighbor', () => {
  const w1 = { id: 'W1', sheet: 1, pts: [[0, 0], [0, 50], [100, 50], [100, 100]] };
  const w2 = { id: 'W2', sheet: 1, pts: [[0, 0], [0, 55], [40, 55], [40, 90], [40, 100]] };
  const d = design([w1, w2]);
  const moved = G.dragSegment(d, 'W1', 1, 60);
  assert.deepEqual(moved.sort(), ['W1', 'W2']);
  assert.equal(w1.pts[1][1], 60);
  assert.equal(w1.pts[2][1], 60);
  assert.equal(w2.pts[1][1], 68);
  assert.equal(w2.pts[2][1], 68);
  assert.ok(Math.abs(w1.pts[1][1] - w2.pts[1][1]) >= G.MIN_CLEAR - 0.01);
});

test('dragSegment rolls back the whole transaction on a keepout conflict', () => {
  const w1 = { id: 'W1', sheet: 1, pts: [[0, 0], [0, 50], [100, 50], [100, 100]] };
  const w2 = { id: 'W2', sheet: 1, pts: [[0, 0], [0, 55], [40, 55], [40, 90], [40, 100]] };
  const dev = { id: 'D', sheet: 1, x: 20, y: 55, sym: { w: 30, h: 20, pins: [] } };
  const d = design([w1, w2], [dev]);
  const moved = G.dragSegment(d, 'W1', 1, 60);
  assert.deepEqual(moved, []);
  assert.deepEqual(w1.pts, [[0, 0], [0, 50], [100, 50], [100, 100]]);
  assert.deepEqual(w2.pts, [[0, 0], [0, 55], [40, 55], [40, 90], [40, 100]]);
});

test('dragSegment refuses to move an endpoint run', () => {
  const w = { id: 'W', sheet: 1, pts: [[0, 0], [0, 50], [100, 50], [100, 100]] };
  const d = design([w]);
  assert.deepEqual(G.dragSegment(d, 'W', 0, 20), []);
  assert.deepEqual(w.pts, [[0, 0], [0, 50], [100, 50], [100, 100]]);
});