/* ============================================================
 * EVSE-SCHEMATIC RENDER v2.0 —— 基元 → SVG（分层，可命中，可编辑）
 *   图层：frame（图框/标题栏/图例/明细表）· wires（走线+跨越半圆）
 *        · devs（器件符号+位号+引脚号）· sel（选中反馈）
 *   每个可选中对象带 data-k / data-id，供编辑器命中测试。
 * ============================================================ */
window.EVSE_RENDER = (function () {
  'use strict';

  const NETC = () => window.EVSE_CORE.NETC;
  const HOP_R = 4.5;
  const TS = {
    title: 'font-size:10px;font-weight:600;fill:#101418',
    dim: 'font-size:7.5px;fill:#5b6472',
    bar: 'font-size:8.5px;font-weight:600;fill:#101418',
    xref: 'font-size:7.6px;fill:#334155',
    pinno: 'font-size:5.6px;fill:#8a93a0',
    pinname: 'font-size:6.8px;fill:#39424f',
    tag: 'font-size:11px;font-weight:700;fill:#0b0f14',
    name: 'font-size:8px;fill:#3c4553',
    spec: 'font-size:7px;fill:#6b7480',
    xrtag: 'font-size:6.5px;font-weight:600;fill:#1e5cc8' /* v2.12: 跨页配对编号 */
  };
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const anch = { m: 'middle', s: 'start', e: 'end' };
  const n2 = (v) => Math.round(v * 100) / 100;

  function primSVG(pr) {
    const t = pr[0];
    if (t === 'L') return '<line x1="' + n2(pr[1]) + '" y1="' + n2(pr[2]) + '" x2="' + n2(pr[3]) + '" y2="' + n2(pr[4]) + '" stroke="#101418" stroke-width="' + (pr[5] || 0.9) + '" stroke-linecap="square"/>';
    if (t === 'D') return '<line x1="' + n2(pr[1]) + '" y1="' + n2(pr[2]) + '" x2="' + n2(pr[3]) + '" y2="' + n2(pr[4]) + '" stroke="#101418" stroke-width="0.7" stroke-dasharray="4 3"/>';
    if (t === 'R') return '<rect x="' + n2(pr[1]) + '" y="' + n2(pr[2]) + '" width="' + n2(pr[3]) + '" height="' + n2(pr[4]) + '" rx="' + (pr[5] || 0) + '" fill="#fff" stroke="#101418" stroke-width="1"/>';
    if (t === 'C') return '<circle cx="' + n2(pr[1]) + '" cy="' + n2(pr[2]) + '" r="' + n2(pr[3]) + '" fill="none" stroke="#101418" stroke-width="0.9"/>';
    if (t === 'CF') return '<circle cx="' + n2(pr[1]) + '" cy="' + n2(pr[2]) + '" r="' + n2(pr[3]) + '" fill="#101418"/>';
    if (t === 'A') {
      const a0 = pr[4] * Math.PI / 180, a1 = pr[5] * Math.PI / 180, r = pr[3];
      const x0 = pr[1] + r * Math.cos(a0), y0 = pr[2] + r * Math.sin(a0);
      const x1 = pr[1] + r * Math.cos(a1), y1 = pr[2] + r * Math.sin(a1);
      return '<path d="M ' + n2(x0) + ' ' + n2(y0) + ' A ' + r + ' ' + r + ' 0 0 1 ' + n2(x1) + ' ' + n2(y1) + '" fill="none" stroke="#101418" stroke-width="0.9"/>';
    }
    if (t === 'P') return '<path d="' + pr[1] + '" fill="none" stroke="#101418" stroke-width="0.9"/>';
    if (t === 'M') return '<rect x="' + n2(pr[1]) + '" y="' + n2(pr[2]) + '" width="' + n2(pr[3]) + '" height="' + n2(pr[4]) + '" fill="#fff" stroke="none"/>';
    if (t === 'T') return '<text x="' + n2(pr[1]) + '" y="' + n2(pr[2]) + '" text-anchor="' + (anch[pr[5]] || 'start') + '" style="' + (TS[pr[6]] || TS.dim) + '">' + esc(pr[3]) + '</text>';
    return '';
  }

  const OFF = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

  function devSVG(dv, opts) {
    const o = opts || {};
    let s = '<g class="dev" data-k="dev" data-id="' + dv.id + '" transform="translate(' + n2(dv.x) + ',' + n2(dv.y) + ')">';
    if (dv.rot) s += '<g transform="rotate(' + dv.rot + ',' + n2(dv.sym.w / 2) + ',' + n2(dv.sym.h / 2) + ')">';
    s += '<rect class="devhit" x="' + (-14) + '" y="' + (-14) + '" width="' + (dv.sym.w + 28) + '" height="' + (dv.sym.h + 28) + '" fill="transparent"/>';
    if (!dv.sym.isBus && !dv.sym.isXref && !dv.pwr) s += '<rect x="-8" y="-8" width="' + (dv.sym.w + 16) + '" height="' + (dv.sym.h + 16) + '" fill="none" stroke="#1e5cc8" stroke-width="0.7" stroke-dasharray="4 3" opacity="0.4"/>'; /* V7-PIN3: 蓝色禁布框常显 = 走线/挪动禁入区 */
    dv.sym.draw.forEach(function (pr) { s += primSVG(pr); });
    dv.sym.pins.forEach(function (p) {
      const v = OFF[p.d] || [1, 0];
      const ext = 0; /* V11b: 外伸腿取消；平齐由框线=pin 线保证 */
      const tx = p.x + v[0] * ext, ty = p.y + v[1] * ext;
      if (p.len) s += '<line x1="' + n2(p.x) + '" y1="' + n2(p.y) + '" x2="' + n2(p.x - v[0] * p.len) + '" y2="' + n2(p.y - v[1] * p.len) + '" stroke="#101418" stroke-width="0.9"/>';
      const conn = o.connPins && o.connPins[dv.id + ':' + p.n];
      /* V11-FLUSH: 外伸腿取消——pin 电气点已与外边框平齐，框线→端子内线由符号自画 */
      s += '<circle class="pin" data-k="pin" data-id="' + dv.id + '/' + p.n + '" cx="' + n2(tx) + '" cy="' + n2(ty) + '" r="7" fill="transparent"/>'; /* v2.27: 命中圈加大 */
      if (o.pinName && p.name && dv.sym.nameIn) {
        let ix, iy, a;
        if (p.d === 'N') { ix = p.x; iy = p.y - 27; a = 'm'; }            /* V7-PIN2: 顶部引脚名让开外伸腿 */
        else if (p.d === 'S') { ix = p.x; iy = p.y + 33; a = 'm'; }        /* V7-PIN2: 底部引脚名让开外伸腿 */
        else {
          ix = p.x - v[0] * (p.len + 5); iy = p.y + 2.4;
          a = p.d === 'W' ? 's' : 'e';
        }
        s += '<text x="' + n2(ix) + '" y="' + n2(iy) + '" text-anchor="' + anch[a] + '" style="' + TS.pinname + '">' + esc(p.name) + '</text>';
      }
      if (o.pinNo && p.n) {
        const vert = p.d === 'N' || p.d === 'S';
        const px = vert ? p.x + 4 : p.x + (p.d === 'E' ? 6 : -6);
        const py = p.y + (vert ? (p.d === 'N' ? -3 : 7) : -4);
        const a = vert ? 'start' : (p.d === 'E' ? 'start' : 'end');
        s += '<text x="' + n2(px) + '" y="' + n2(py) + '" text-anchor="' + a + '" style="' + TS.pinno + '">' + esc(p.n) + '</text>';
      }
    });
    if (dv.tag && dv.sym.tagAt) {
      const off = dv.tagOff || { dx: 0, dy: 0 };
      const t = { x: dv.sym.tagAt.x + off.dx, y: dv.sym.tagAt.y + off.dy, a: dv.sym.tagAt.a };
      s += '<text class="lbl" data-k="label" data-id="' + dv.id + '.tag" x="' + n2(t.x) + '" y="' + n2(t.y) + '" text-anchor="' + (anch[t.a] || 'start') + '" style="' + TS.tag + '">' + esc(dv.tag) + '</text>';
      if (o.devName) {
        const below = t.a === 'e' ? -4 : 0;
        s += '<text class="lbl" data-k="label" data-id="' + dv.id + '.name" x="' + n2(t.x + below) + '" y="' + n2(t.y + 10) + '" text-anchor="' + (anch[t.a] || 'start') + '" style="' + TS.name + '">' + esc(dv.name) + '</text>';
        if (dv.spec) s += '<text class="lbl" data-k="label" data-id="' + dv.id + '.spec" x="' + n2(t.x + below) + '" y="' + n2(t.y + 19) + '" text-anchor="' + (anch[t.a] || 'start') + '" style="' + TS.spec + '">' + esc(dv.spec) + '</text>';
      }
    }
    if (dv.rot) s += '</g>';
    s += '</g>';
    return s;
  }

  /* 走线：把 hop 烘进 path（半圆跨越），另出透明命中线段 */
  function wirePath(w, hops) {
    const pts = w.pts;
    let d = '';
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (i === 0) d += 'M ' + n2(a[0]) + ' ' + n2(a[1]) + ' ';
      const vert = Math.abs(a[0] - b[0]) < 0.01;
      const hs = (hops || []).filter(function (h) {
        if (!vert) return false;
        if (Math.abs(h.x - a[0]) > 0.6) return false;
        return h.y > Math.min(a[1], b[1]) + 1 && h.y < Math.max(a[1], b[1]) - 1;
      }).sort(function (m, n) { return (b[1] > a[1] ? 1 : -1) * (m.y - n.y); });
      const down = b[1] > a[1];
      hs.forEach(function (h) {
        const y0 = down ? h.y - HOP_R : h.y + HOP_R, y1 = down ? h.y + HOP_R : h.y - HOP_R;
        d += 'L ' + n2(a[0]) + ' ' + n2(y0) + ' A ' + HOP_R + ' ' + HOP_R + ' 0 0 ' + (down ? 1 : 0) + ' ' + n2(a[0]) + ' ' + n2(y1) + ' ';
      });
      d += 'L ' + n2(b[0]) + ' ' + n2(b[1]) + ' ';
    }
    return d;
  }

  function wiresSVG(design, no, opts) {
    const o = opts || {}, C = NETC();
    const hopsBy = {};
    (design.hops || []).forEach(function (h) { (hopsBy[h.w] = hopsBy[h.w] || []).push(h); });
    let s = '';
    design.wires.forEach(function (w) {
      if (w.sheet !== no) return;
      if (o.layers && o.layers[w.cls] === false) return;
      const c = C[w.cls] || C.CTL;
      const hi = o.hiNet === w.net || (o.selWires && o.selWires[w.id]);
      s += '<path data-k="wireview" data-cls="' + w.cls + '" data-id="' + w.id + '" d="' + wirePath(w, hopsBy[w.id]) + '" fill="none" stroke="' + (hi ? '#0ea5e9' : c.color) + '" stroke-width="' + (hi ? c.w + 1.6 : c.w) + '" stroke-linejoin="round" stroke-linecap="round"/>';
    });
    design.wires.forEach(function (w) {
      if (w.sheet !== no) return;
      if (o.layers && o.layers[w.cls] === false) return;
      window.EVSE_GEO.segsOf(w.pts).forEach(function (sg, i) {
        s += '<line class="whit" data-k="wire" data-id="' + w.id + '" data-seg="' + i + '" x1="' + n2(sg.x1) + '" y1="' + n2(sg.y1) + '" x2="' + n2(sg.x2) + '" y2="' + n2(sg.y2) + '" stroke="transparent" stroke-width="7"/>';
      });
    });
    (design.junctions || []).forEach(function (j, i) {
      s += (j.sheet !== no) ? '' : '<circle class="junc" data-k="junc" data-id="J' + i + '" cx="' + n2(j.x) + '" cy="' + n2(j.y) + '" r="2.6" fill="#101418"/>'
        + '<circle class="junchit" data-k="junc" data-id="J' + i + '" cx="' + n2(j.x) + '" cy="' + n2(j.y) + '" r="8" fill="transparent" style="cursor:move"/>';
    });
    return s;
  }

  /* ---------- 图框 / 标题栏 / 图例 / 明细表 ---------- */
  function frameSVG(design, no, opts) {
    const sh = design.sheets.filter(function (s) { return s.no === no; })[0];
    const F = sh.frame, C = NETC();
    let s = '<rect x="0" y="0" width="' + (F.w + 120) + '" height="' + (F.h + 120) + '" fill="#ffffff"/>';
    s += '<rect x="' + F.x + '" y="' + F.y + '" width="' + F.w + '" height="' + F.h + '" fill="none" stroke="#101418" stroke-width="2.4"/>';
    s += '<rect x="' + (F.x + 14) + '" y="' + (F.y + 14) + '" width="' + (F.w - 28) + '" height="' + (F.h - 28) + '" fill="none" stroke="#101418" stroke-width="0.8"/>';
    /* 分区标尺 A/B/C… 1/2/3… */
    const cols = Math.floor((F.w - 28) / 200), rows = Math.floor((F.h - 28) / 200);
    for (let i = 1; i < cols; i++) {
      const x = F.x + 14 + i * 200;
      s += '<line x1="' + x + '" y1="' + F.y + '" x2="' + x + '" y2="' + (F.y + 14) + '" stroke="#101418" stroke-width="0.8"/>';
      s += '<line x1="' + x + '" y1="' + (F.y + F.h - 14) + '" x2="' + x + '" y2="' + (F.y + F.h) + '" stroke="#101418" stroke-width="0.8"/>';
      s += '<text x="' + (x - 100) + '" y="' + (F.y + 11) + '" text-anchor="middle" style="' + TS.dim + '">' + i + '</text>';
    }
    for (let i = 1; i < rows; i++) {
      const y = F.y + 14 + i * 200;
      s += '<line x1="' + F.x + '" y1="' + y + '" x2="' + (F.x + 14) + '" y2="' + y + '" stroke="#101418" stroke-width="0.8"/>';
      s += '<text x="' + (F.x + 7) + '" y="' + (y - 92) + '" text-anchor="middle" style="' + TS.dim + '">' + String.fromCharCode(64 + i) + '</text>';
    }
    /* 标题栏 */
    const TW = 560, TH = 150, tx = F.x + F.w - 14 - TW, ty = F.y + F.h - 14 - TH;
    s += '<rect x="' + tx + '" y="' + ty + '" width="' + TW + '" height="' + TH + '" fill="#fff" stroke="#101418" stroke-width="1.6"/>';
    const tb = (design.params && design.params.tb) || {}; /* V13: 自定义标题栏（新建图纸对话框写入）；无则保持生成方案原样 */
    const rowsT = [
      ['项目', design.params.name, '图号', tb.dwgNo || ('EVSE-CONCEPT-10' + no)],
      ['图名', sh.title.split('·')[0].trim(), '页次', no + ' / ' + design.sheets.length],
      ['标准', tb.std || (design.params.std === 'gb' ? 'GB/T 20234.3 · GB/T 27930' : 'IEC 62196-3 · DIN 70121'), '版本', tb.ver || 'P01'],
      ['编制', tb.author || 'AUTO_GENERATED', '校核', tb.checker || 'UNASSIGNED'],
      ['批准', tb.approver || 'UNASSIGNED', '状态', tb.status || 'CONCEPT_DRAFT']
    ];
    rowsT.forEach(function (r, i) {
      const y = ty + 26 + i * 25;
      s += '<line x1="' + tx + '" y1="' + (y - 18) + '" x2="' + (tx + TW) + '" y2="' + (y - 18) + '" stroke="#101418" stroke-width="0.6"/>';
      s += '<text x="' + (tx + 8) + '" y="' + y + '" style="' + TS.dim + '">' + esc(r[0]) + '</text>';
      s += '<text x="' + (tx + 62) + '" y="' + y + '" style="' + TS.title + '">' + esc(r[1]) + '</text>';
      s += '<text x="' + (tx + 330) + '" y="' + y + '" style="' + TS.dim + '">' + esc(r[2]) + '</text>';
      s += '<text x="' + (tx + 386) + '" y="' + y + '" style="' + TS.title + '">' + esc(r[3]) + '</text>';
    });
    s += '<text x="' + (tx + 8) + '" y="' + (ty + TH - 6) + '" style="font-size:7px;fill:#94a3b8">方案级概念草图，须经电气专业复核；不构成生产/施工图或合规证明。</text>';
    /* 图例 */
    const lx = F.x + 30, ly = ty - 30;
    const keys = ['AC', 'DC', 'ESS', 'AUX', 'CTL', 'COMM', 'SAF', 'PE'];
    s += '<text x="' + lx + '" y="' + (ly - keys.length * 18 - 10) + '" style="' + TS.title + '">线型图例</text>';
    keys.forEach(function (k, i) {
      const y = ly - (keys.length - 1 - i) * 18;
      s += '<line x1="' + lx + '" y1="' + y + '" x2="' + (lx + 46) + '" y2="' + y + '" stroke="' + C[k].color + '" stroke-width="' + C[k].w + '"/>';
      s += '<text x="' + (lx + 56) + '" y="' + (y + 3) + '" style="' + TS.dim + '">' + esc(C[k].name) + '</text>';
    });
    /* 设备明细表：类别·名称·型号参考·推荐厂家·关键参数·数量·说明·手册链接 */
    const wrap = function (t, cw, size, max) {
      const per = Math.max(1, Math.floor(cw / (size * 0.62)));
      const src = String(t == null ? '' : t), out = [];
      let cur = '', w = 0;
      for (let i = 0; i < src.length && out.length < (max || 3); i++) {
        const ch = src[i], cwid = /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1.62 : 1;
        if (w + cwid > per) { out.push(cur); cur = ch; w = cwid; } else { cur += ch; w += cwid; }
      }
      if (cur && out.length < (max || 3)) out.push(cur);
      if (out.length === (max || 3) && cur && out[out.length - 1] !== cur) out[out.length - 1] += '…';
      return out.length ? out : [''];
    };
    const BOM = window.EVSE_BOM;
    const devs = design.devices.filter(function (d) { return d.sheet === no && !d.sym.isXref && !d.pwr; }); /* v2.23: 旗标非实体不入 BOM */
    const grp = {}, order = [];
    devs.forEach(function (d) {
      const k = BOM ? BOM.classify(d) : { cat: '—', series: '—', vendors: [], note: '' };
      const key = k.cat + '|' + d.name + '|' + (d.spec || '');
      if (!grp[key]) {
        grp[key] = { cat: k.cat, name: d.name, model: k.series, vendors: k.vendors,
          params: d.spec || '—', qty: 0, note: k.note || '—', tags: [], sym: d.sym };
        const dl = BOM ? BOM.docLink(grp[key]) : null;
        grp[key].doc = dl ? dl.url : '';
        grp[key].docKind = dl ? dl.kind : 'none';
        grp[key].docVendor = dl ? dl.vendor : '';
        grp[key].hint = dl ? dl.hint : '';
        order.push(key);
      }
      grp[key].qty++; grp[key].tags.push(d.tag);
    });
    const bomRows = order.map(function (k) { return grp[k]; }).sort(function (a, b) {
      const ia = BOM ? BOM.CATS.indexOf(a.cat) : 0, ib = BOM ? BOM.CATS.indexOf(b.cat) : 0;
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.name.localeCompare(b.name, 'zh');
    });
    /* 列宽（合计 1180） */
    const CW = [96, 132, 176, 168, 210, 34, 200, 164];
    const CH = ['类别', '设备名称', '型号参考', '推荐厂家', '关键参数', '数量', '说明', '手册下载链接'];
    const bw = CW.reduce(function (a, c) { return a + c; }, 0) + 16;
    /* MWESS frame sizing reserves a right-hand column for this table. */
    const bx = F.x + F.w - 14 - bw, by = F.y + 40;
    const FS = 6.6, LH = 8.4;
    const cells = bomRows.map(function (r) {
      const dl = BOM ? BOM.docLabel(r) : { text: '—', url: '' };
      const c = [
        wrap(r.cat, CW[0] - 8, FS, 2),
        wrap(r.name, CW[1] - 8, FS, 2),
        wrap(r.model, CW[2] - 8, FS, 3),
        wrap(r.vendors.length ? r.vendors.join(' / ') : '—', CW[3] - 8, FS, 3),
        wrap(r.params, CW[4] - 8, FS, 3),
        [String(r.qty)],
        wrap(r.note, CW[6] - 8, FS, 3),
        wrap(dl.text, CW[7] - 8, FS, 2)
      ];
      const h = Math.max.apply(null, c.map(function (x) { return x.length; })) * LH + 5;
      return { c: c, h: h, dl: dl, tags: r.tags.join(' ') };
    });
    const bodyH = cells.reduce(function (a, r) { return a + r.h; }, 0);
    const HDR = 40, TOTH = HDR + bodyH + 20;
    s += '<rect x="' + bx + '" y="' + by + '" width="' + bw + '" height="' + TOTH + '" fill="#fff" stroke="#101418" stroke-width="1.2"/>';
    s += '<text x="' + (bx + 8) + '" y="' + (by + 15) + '" style="' + TS.title + '">设备明细表 / 工程 BOM（页 ' + no + '）· ' + bomRows.length + ' 项 / ' + devs.length + ' 件 · 全部条目 RFQ_REQUIRED</text>';
    s += '<line x1="' + bx + '" y1="' + (by + 22) + '" x2="' + (bx + bw) + '" y2="' + (by + 22) + '" stroke="#101418" stroke-width="1"/>';
    s += '<rect x="' + bx + '" y="' + (by + 22) + '" width="' + bw + '" height="' + (HDR - 22) + '" fill="#eef2f6"/>';
    let cx0 = bx + 8;
    CH.forEach(function (h, i) {
      s += '<text x="' + cx0 + '" y="' + (by + 35) + '" style="font-size:6.8px;font-weight:700;fill:#101418">' + esc(h) + '</text>';
      cx0 += CW[i];
      if (i < CH.length - 1) s += '<line x1="' + (cx0 - 4) + '" y1="' + (by + 22) + '" x2="' + (cx0 - 4) + '" y2="' + (by + HDR + bodyH) + '" stroke="#c9d2dc" stroke-width="0.5"/>';
    });
    s += '<line x1="' + bx + '" y1="' + (by + HDR) + '" x2="' + (bx + bw) + '" y2="' + (by + HDR) + '" stroke="#101418" stroke-width="0.8"/>';
    let ry = by + HDR;
    let lastCat = null;
    cells.forEach(function (rc, ri) {
      const r = bomRows[ri];
      if (ri > 0) s += '<line x1="' + bx + '" y1="' + ry + '" x2="' + (bx + bw) + '" y2="' + ry + '" stroke="' + (r.cat !== lastCat ? '#101418' : '#dde4ec') + '" stroke-width="' + (r.cat !== lastCat ? 0.8 : 0.4) + '"/>';
      lastCat = r.cat;
      let x = bx + 8;
      rc.c.forEach(function (lines, ci) {
        const bold = ci === 1 || ci === 5;
        const isDoc = ci === 7;
        const fill = ci === 0 ? '#1F5FC0' : ci === 6 ? '#6b7480' : isDoc ? (rc.dl.url ? '#1F5FC0' : '#94a3b8') : '#26303c';
        lines.forEach(function (ln, li) {
          const body = '<text x="' + (ci === 5 ? x + 12 : x) + '" y="' + (ry + 11 + li * LH) + '"'
            + (ci === 5 ? ' text-anchor="middle"' : '')
            + ' style="font-size:' + FS + 'px;' + (bold ? 'font-weight:700;' : '')
            + (isDoc && rc.dl.url ? 'text-decoration:underline;' : '') + 'fill:' + fill + '">' + esc(ln) + '</text>';
          s += (isDoc && rc.dl.url) ? '<a href="' + esc(rc.dl.url) + '" target="_blank"><title>' + esc(rc.dl.url) + '</title>' + body + '</a>' : body;
        });
        x += CW[ci];
      });
      if (rc.tags) {
        s += '<text x="' + (bx + 8 + CW.slice(0, 6).reduce(function (a, c) { return a + c; }, 0)) + '" y="'
          + (ry + rc.h - 2) + '" style="font-size:5.8px;fill:#a8b2bd">位号 ' + esc(rc.tags) + '</text>';
      }
      ry += rc.h;
    });
    s += '<text x="' + (bx + 8) + '" y="' + (ry + 13) + '" style="font-size:6.2px;fill:#94a3b8">数量·关键参数·位号由引脚级网表计算得出；型号参考仅到系列级，推荐厂家为该品类常见候选（非推荐背书、非授权关系）；手册链接优先原厂文档中心，标 AI 的链接为模型/搜索推荐，均须人工核验并归档厂家原文。</text>';
    return s;
  }

  function sheet(design, no, opts) {
    const sh = design.sheets.filter(function (s) { return s.no === no; })[0];
    const F = sh.frame;
    opts = opts || {};
    /* V10: 已接线 pin 集合 → devSVG 不画外伸腿（线即引线，消除双线重合） */
    const cp = {};
    (design.wires || []).forEach(function (w) { if (w.a) cp[w.a.dev + ':' + w.a.pin] = 1; if (w.b) cp[w.b.dev + ':' + w.b.pin] = 1; });
    opts.connPins = cp;
    return {
      w: F.w + 120, h: F.h + 120,
      svg: '<g id="lay-frame">' + frameSVG(design, no, opts) + '</g>'
        + '<g id="lay-wires">' + wiresSVG(design, no, opts) + '</g>'
        + '<g id="lay-devs">' + design.devices.filter(function (d) { return d.sheet === no && d.x != null; }).map(function (d) { return devSVG(d, opts); }).join('') + '</g>'
        + '<g id="lay-sel"></g>'
    };
  }

  function fullSVG(design, no, opts) {
    const r = sheet(design, no, opts);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + r.w + '" height="' + r.h + '" viewBox="0 0 ' + r.w + ' ' + r.h + '" font-family="Arial Narrow, Helvetica Neue, Helvetica, Microsoft YaHei, sans-serif">' + r.svg + '</svg>';
  }

  return { sheet, fullSVG, wiresSVG, devSVG, frameSVG, TS };
})();
