const test = require('node:test');
const assert = require('node:assert/strict');
global.window = global;
require('../evse-geo.js');
const G = global.window.EVSE_GEO;
global.window.EVSE_CORE = { rails: () => ({}) };

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

function auditDesign(wires, nets, devices, hops, junctions) {
  devices = devices || [];
  const map = {};
  devices.forEach(d => map[d.id] = d);
  return {
    params: { family: 'evse', guns: 1, ess: false, essClusters: 1, coupling: 'dc' },
    status: 'CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED',
    sheets: [{ no: 1, title: '主回路' }], devices, nets: nets || [], wires,
    map, boxes: [], hops: hops || [], junctions: junctions || [], _ni: null
  };
}

test('audit blocks an unmarked crossing between different nets', () => {
  const d = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[0, 50], [100, 50]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[50, 0], [50, 100]] }
  ], [
    { id: 'N1', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', a: { d: 'C', p: '1' }, b: { d: 'D', p: '1' } }
  ]);
  G.audit(d);
  const c03 = d.audit.items.find(x => x.id === 'C03');
  assert.equal(c03.ok, false);
  assert.equal(c03.level, 'error');
  assert.match(c03.detail, /W2\/W1@50,50/);
});

test('crossings adds sheet-scoped hops for identical coordinates on different pages', () => {
  const d = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[0, 50], [100, 50]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[50, 0], [50, 100]] },
    { id: 'W3', net: 'N3', sheet: 2, pts: [[0, 50], [100, 50]] },
    { id: 'W4', net: 'N4', sheet: 2, pts: [[50, 0], [50, 100]] }
  ]);
  G.crossings(d);
  assert.equal(d.hops.filter(h => h.x === 50 && h.y === 50 && h.sheet === 1).length, 1);
  assert.equal(d.hops.filter(h => h.x === 50 && h.y === 50 && h.sheet === 2).length, 1);
});

test('audit requires and generates a junction dot for same-net branches', () => {
  const d = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[0, 50], [100, 50]] },
    { id: 'W2', net: 'N1', sheet: 1, pts: [[50, 0], [50, 100]] }
  ], [{ id: 'N1', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } }]);
  G.audit(d);
  assert.equal(d.audit.items.find(x => x.id === 'C04').ok, false);
  G.crossings(d);
  G.audit(d);
  assert.equal(d.audit.items.find(x => x.id === 'C04').ok, true);
  assert.ok(d.junctions.some(j => j.sheet === 1 && j.x === 50 && j.y === 50));
});

test('pairwise nets from one physical terminal are treated as one electrical node', () => {
  const a = { id: 'A', sheet: 1, x: 0, y: 0, sym: { w: 40, h: 40, pins: [{ n: '1', x: 40, y: 20, d: 'E' }] } };
  const d = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[40, 20], [100, 20]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[40, 20], [40, 80]] }
  ], [
    { id: 'N1', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', a: { d: 'A', p: '1' }, b: { d: 'C', p: '1' } }
  ], [a]);
  G.crossings(d);
  G.audit(d);
  assert.equal(d.hops.length, 0);
  assert.equal(d.junctions.filter(j => j.x === 40 && j.y === 20).length, 0);
  assert.equal(d.audit.items.find(x => x.id === 'C03').ok, true);
  assert.equal(d.audit.items.find(x => x.id === 'C04').ok, true);
});

test('coincident endpoints from unrelated nets do not receive a junction dot', () => {
  const d = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[0, 20], [40, 20]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[40, 20], [40, 80]] }
  ], [
    { id: 'N1', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', a: { d: 'C', p: '1' }, b: { d: 'D', p: '1' } }
  ]);
  G.crossings(d);
  G.audit(d);
  assert.equal(d.junctions.filter(j => j.x === 40 && j.y === 20).length, 0);
  assert.equal(d.audit.items.find(x => x.id === 'C03').ok, false);
  assert.equal(d.audit.items.find(x => x.id === 'C04').ok, true);
});

test('detouch recognizes a physical pin and moves the nonterminal wire', () => {
  const a = { id: 'A', sheet: 1, x: 0, y: 0, sym: { isBus: true, w: 1, h: 1, pins: [{ n: '1', x: 50, y: 50, d: 'E' }] } };
  const w1 = { id: 'W1', net: 'N1', sheet: 1, pts: [[50, 50], [50, 100]] };
  const w2 = { id: 'W2', net: 'N2', sheet: 1, pts: [[0, 50], [100, 50]] };
  const d = auditDesign([w1, w2], [
    { id: 'N1', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', a: { d: 'C', p: '1' }, b: { d: 'D', p: '1' } }
  ], [a]);
  G.detouch(d);
  assert.deepEqual(w1.pts, [[50, 50], [50, 100]]);
  assert.notEqual(w2.pts[0][1], 50);
  G.crossings(d);
  G.audit(d);
  assert.equal(d.audit.items.find(x => x.id === 'C03').ok, true);
});

test('clearance and overlap checks only exempt a short shared-pin lead', () => {
  const a = { id: 'A', sheet: 1, x: 0, y: 0, sym: { w: 40, h: 40, pins: [{ n: '1', x: 40, y: 20, d: 'E' }] } };
  const b = { id: 'B', sheet: 1, x: 200, y: 0, sym: { w: 40, h: 40, pins: [{ n: '1', x: 0, y: 20, d: 'W' }] } };
  const c = { id: 'C', sheet: 1, x: 200, y: 100, sym: { w: 40, h: 40, pins: [{ n: '1', x: 0, y: 20, d: 'W' }] } };
  const nets = [
    { id: 'N1', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', a: { d: 'A', p: '1' }, b: { d: 'C', p: '1' } }
  ];
  const devices = [a, b, c];
  const short = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[40, 20], [60, 20], [60, 40], [200, 40], [200, 20]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[40, 20], [60, 20], [80, 20], [80, 120], [200, 120]] }
  ], nets, devices);
  G.audit(short);
  assert.equal(short.audit.items.find(x => x.id === 'C05').ok, true);
  assert.equal(short.audit.items.find(x => x.id === 'C14').ok, true);

  const long = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[40, 20], [100, 20], [100, 40], [200, 40], [200, 20]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[40, 20], [100, 20], [100, 120], [200, 120]] }
  ], nets, devices);
  G.audit(long);
  assert.equal(long.audit.items.find(x => x.id === 'C05').ok, false);
  assert.equal(long.audit.items.find(x => x.id === 'C14').ok, false);

  const sliver = auditDesign([
    { id: 'W1', net: 'N1', sheet: 1, pts: [[0, 50], [100, 50]] },
    { id: 'W2', net: 'N2', sheet: 1, pts: [[40, 55], [41, 55]] }
  ], []);
  G.audit(sliver);
  assert.equal(sliver.audit.items.find(x => x.id === 'C05').ok, true);
});

test('strict routing refuses to silently stack a second wire on the same occupied channel', () => {
  const a = { id: 'A', sheet: 1, x: 0, y: 0, sym: { w: 40, h: 40, pins: [
    { n: '1', x: 40, y: 20, d: 'E' }, { n: '2', x: 40, y: 20, d: 'E' }
  ] } };
  const b = { id: 'B', sheet: 1, x: 200, y: 0, sym: { w: 40, h: 40, pins: [
    { n: '1', x: 0, y: 20, d: 'W' }, { n: '2', x: 0, y: 20, d: 'W' }
  ] } };
  const nets = [
    { id: 'N1', cls: 'AC', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', cls: 'AC', a: { d: 'A', p: '2' }, b: { d: 'B', p: '2' } }
  ];
  const d = { params: { family: 'mwess' }, sheets: [{ no: 1 }], devices: [a, b], map: { A: a, B: b },
    nets, wires: [], boxes: [], hops: [], junctions: [] };
  G.route(d);
  assert.equal(d.wires.length, 1);
  assert.equal(nets[1].err, 'ROUTE_NO_CLEAR_PATH');
});

test('strict routing allows a short shared lead from one real terminal', () => {
  const a = { id: 'A', sheet: 1, x: 0, y: 0, sym: { w: 40, h: 40, pins: [{ n: '1', x: 40, y: 20, d: 'E' }] } };
  const b = { id: 'B', sheet: 1, x: 200, y: 0, sym: { w: 40, h: 40, pins: [{ n: '1', x: 0, y: 20, d: 'W' }] } };
  const c = { id: 'C', sheet: 1, x: 200, y: 80, sym: { w: 40, h: 40, pins: [{ n: '1', x: 0, y: 20, d: 'W' }] } };
  const nets = [
    { id: 'N1', cls: 'AC', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } },
    { id: 'N2', cls: 'AC', a: { d: 'A', p: '1' }, b: { d: 'C', p: '1' } }
  ];
  const d = { params: { family: 'mwess' }, sheets: [{ no: 1 }], devices: [a, b, c], map: { A: a, B: b, C: c },
    nets, wires: [], boxes: [], hops: [], junctions: [] };
  G.route(d);
  assert.equal(d.wires.length, 2);
  assert.equal(nets[1].err, undefined);
});

test('B02 blocks networks that have physical pins but no generated route', () => {
  const a = { id: 'A', sheet: 1, x: 0, y: 0, sym: { w: 20, h: 20, pins: [{ n: '1', x: 20, y: 10, d: 'E' }] } };
  const b = { id: 'B', sheet: 1, x: 100, y: 0, sym: { w: 20, h: 20, pins: [{ n: '1', x: 0, y: 10, d: 'W' }] } };
  const d = auditDesign([], [{ id: 'N1', err: 'ROUTE_NO_CLEAR_PATH', a: { d: 'A', p: '1' }, b: { d: 'B', p: '1' } }], [a, b]);
  G.audit(d);
  const b02 = d.audit.items.find(x => x.id === 'B02');
  assert.equal(b02.ok, false);
  assert.match(b02.detail, /无合法路径 1 条/);
});

test('C11 uses exact segment clearance intersection instead of sparse samples', () => {
  const dev = { id: 'D', sheet: 1, x: 500, y: 100, sym: { w: 20, h: 20, pins: [], draw: [] } };
  const d = auditDesign([{ id: 'W1', net: 'N1', sheet: 1, pts: [[0, 95], [1000, 95]] }], [], [dev]);
  G.audit(d);
  const c11 = d.audit.items.find(x => x.id === 'C11');
  assert.equal(c11.ok, false);
  assert.match(c11.detail, /1 条线/);
});

test('non-applicable score categories are N/A and receive no points', () => {
  const d = auditDesign([]);
  G.audit(d);
  const g = d.audit.score.find(x => x.id === 'G');
  assert.equal(g.applicable, false);
  assert.equal(g.appliedWeight, 0);
  assert.equal(g.got, 0);
  assert.equal(d.audit.applicableWeight < d.audit.rubricWeight, true);
  assert.equal(d.audit.grade === 'S', false);
});
