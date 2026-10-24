/* ============================================================
 * EVSE 手册数据库 v2.0（evse-manual-kb）
 * ------------------------------------------------------------
 * 定位：设备明细表 / 工程 BOM「手册下载链接」列的唯一事实源。
 *
 * 状态字段 status（务必诚实标注）：
 *   ok     —— 2026-09-26 联网实测可达（或品牌官网根域权威稳定）
 *   warn   —— 域名可达但路径待复核 / 反爬拦截（浏览器可开）/ 未联网复核
 *   nohref —— 无公开手册：给检索提示词，不给链接（明确告知）
 *
 * 核验记录（2026-09-26，web_fetch 实测）：
 *   可达：library.abb.com · hongfa.com/pro · titans.com.cn · catl.com/en
 *         se.com/cn/zh/download · weinview.cn · meanwell productSearch
 *         lem.com/en · bender.de/en · eaton.com.cn · phoenixcontact.com/zh-cn
 *   失效：infypower.com/download.html(404) · yonggui.com.cn(DNS)
 *         sinexcel.com/download(404) · obo.com.cn/downloads(404)
 *         phoenixcontact.com/zh-cn/download(404) · bender.de/en/downloads(404)
 *         lem.com/en/productfinder(404) · vishay.com/en/resistors(403)
 *         eaton.com fuses.resources(重定向死循环) · chint.com/product/ddsu666(404)
 *         new.abb.com/low-voltage/zh-cn/products/*(404，官网2026改版)
 *   接管：schaffner.com → TE(已收购)；usr.cn(反爬403)；wasion.com(请求失败×2)
 *
 * 开发者导入接口：
 *   EVSE_MANUAL_KB.merge(jsonObj) —— 合并/覆盖（同名 vendor 条目覆盖）
 *   EVSE_MANUAL_KB.load(url)       —— 拉取外部 JSON 后 merge
 *   EVSE_MANUAL_KB.pick(row)       —— BOM 行匹配（该品类该厂家最优条目）
 *   EVSE_MANUAL_KB.list()          —— 全量导出
 *   JSON 格式：{ "<品类>": [ { vendor, title, url, status, note?, hint? } ] }
 *   参考模板：deploy/manual-db.example.json
 * ============================================================ */
window.EVSE_MANUAL_KB = (function () {
  'use strict';

  const VER = '2.0.0';
  const CHECKED = '2026-09-26';

  let KB = {
    /* ---------- BOM 链接列主覆盖（对应 docLink 品类） ---------- */
    '充电功率模块': [
      { vendor: '英飞源', title: '充电模块', url: '', status: 'nohref', hint: '官网域名不稳定（infypower.com 404 / infy-power.com 疑停放），请检索「英飞源 充电模块 说明书」' },
      { vendor: '华为数字能源', title: '充电模块 R1000/R750', url: 'https://digitalpower.huawei.com/cn/products/ev-charging-module/', status: 'warn', note: '华为官网产品页，具体型号手册需站内检索' },
      { vendor: '优优绿能', title: '充电功率模块', url: 'https://www.uugreenpower.com/products/power-module', status: 'warn', note: '未联网复核，域名待验证' },
    ],
    '直流快熔': [
      { vendor: 'Eaton/Bussmann', title: 'Bussmann 直流快熔', url: 'https://www.eaton.com.cn/cn/zh-cn.html', status: 'ok', note: '官网首页实测可达；fuses.resources 深链失效，请站内检索 Bussmann' },
      { vendor: 'Mersen', title: '直流熔断器', url: 'https://www.mersen.com.cn/products/fuses', status: 'warn', note: '未联网复核' },
    ],
    '直流接触器': [
      { vendor: '宏发', title: '高压直流接触器', url: 'https://www.hongfa.com/pro', status: 'ok', note: '官网实测可达，继电器/接触器产品入口' },
      { vendor: '泰科电子 TE', title: 'EVC 高压直流接触器', url: 'https://www.te.com.cn/products/evc-contactors.html', status: 'warn', note: '未联网复核' },
    ],
    '交流主接触器': [
      { vendor: 'ABB', title: 'ABB Library 检索', url: 'https://library.abb.com/', status: 'ok', note: 'ABB 官网产品页 2026 改版 404，统一用 Library 检索' },
      { vendor: '施耐德', title: 'TeSys 系列', url: 'https://www.se.com/cn/zh/product-range/1725-tesys-d/', status: 'warn', note: '产品页未联网复核；下载中心实测可达' },
    ],
    '充电枪': [
      { vendor: '永贵电器', title: '充电连接器', url: '', status: 'nohref', hint: '官网 yonggui.com.cn DNS 解析失败，请检索「永贵电器 充电连接器」' },
      { vendor: '中航光电 JONHON', title: '充电枪', url: 'https://www.jonhon.cn/product/ev-charging/', status: 'warn', note: '未联网复核' },
      { vendor: '康尼 KANGNI', title: '充电枪/电子锁', url: 'https://www.kangni.com/product/ev-charging/', status: 'warn', note: '未联网复核' },
    ],
    '电涌保护器 SPD': [
      { vendor: 'OBO', title: 'OBO 中国官网（含资料下载入口）', url: 'https://www.obo.com.cn/', status: 'ok', note: '官网实测可达（/downloads 深链 404，请走 服务支持→资料下载）' },
      { vendor: 'DEHN', title: '电涌保护', url: 'https://www.dehn-international.com/zh/products/surge-protection', status: 'warn', note: '未联网复核' },
      { vendor: 'Phoenix Contact', title: '电涌保护产品', url: 'https://www.phoenixcontact.com/zh-cn/', status: 'ok', note: '官网实测可达（/zh-cn/download 改版 404）' },
    ],
    'EMC 滤波器': [
      { vendor: 'Schaffner', title: 'EMC 滤波器（已并入 TE）', url: 'https://www.schaffner.com/products/emc-emc-filters/', status: 'warn', note: '域名重定向至 te.com（2026 收购），页面结构已变' },
      { vendor: 'TDK', title: 'EMC 滤波器', url: 'https://www.tdk-electronics.tdk.com/zh/emc_filter', status: 'warn', note: '未联网复核' },
    ],
    '电能表': [
      { vendor: '正泰 CHNT', title: '正泰官网（站内检索 DDSU666）', url: 'https://www.chint.com/', status: 'warn', note: 'DDSU666 产品页实测 File not found，请首页站内搜索' },
      { vendor: '威胜 Wasion', title: '威胜官网', url: 'https://www.wasion.com/', status: 'warn', note: '2026-09-26 请求失败×2（疑似反爬），浏览器可尝试' },
      { vendor: '安科瑞 Acrel', title: '直流电能表', url: 'https://www.acrel.cn/product/dc-meter/', status: 'warn', note: '未联网复核' },
    ],
    '霍尔电流传感器': [
      { vendor: 'LEM', title: 'LEM 官网（电流测量）', url: 'https://www.lem.com/en/', status: 'ok', note: '官网实测可达；productfinder 深链 404' },
      { vendor: '南京中旭', title: '霍尔电流传感器', url: 'https://www.zxgd.cc/product/hall/', status: 'warn', note: '未联网复核' },
    ],
    '绝缘监测 IMD': [
      { vendor: 'Bender', title: '绝缘监测产品', url: 'https://www.bender.de/en/products/insulation-monitoring', status: 'ok', note: '官网实测可达（isometer 深链 404，产品入口正常）' },
      { vendor: 'Sendyne', title: '绝缘监测', url: 'https://www.sendyne.com/products/insulation-monitoring', status: 'warn', note: '小厂商站点未联网复核' },
    ],
    '剩余电流监测 RCM': [
      { vendor: 'Bender', title: '剩余电流监测 RCM', url: 'https://www.bender.de/en/products/residual-current-monitoring', status: 'ok', note: '官网实测可达' },
    ],
    '储能 PCS / DC/DC': [
      { vendor: '盛弘 Sinexcel', title: '盛弘官网', url: 'https://www.sinexcel.com/', status: 'warn', note: '域名可达（/download 深链 404），请官网导航找资料中心' },
      { vendor: '阳光电源', title: '储能产品', url: 'https://www.sungrowpower.com/products/business/energy-storage', status: 'warn', note: '未联网复核' },
      { vendor: '科华数据', title: '储能 PCS', url: 'https://www.kehua.com.cn/products/energy-storage-pcs', status: 'warn', note: '未联网复核' },
    ],
    '开关电源': [
      { vendor: '明纬 Mean Well', title: '产品检索（含 datasheet）', url: 'https://www.meanwell.com/productSearch.aspx', status: 'ok', note: '实测可达' },
      { vendor: '明纬(中文)', title: '产品系列', url: 'https://www.meanwell.com.cn/productSeries.aspx?c=2', status: 'warn', note: '未联网复核' },
      { vendor: 'Phoenix Contact', title: '导轨电源', url: 'https://www.phoenixcontact.com/zh-cn/products/power-supplies/din-rail-power-supplies', status: 'warn', note: '未联网复核' },
    ],
    '风机': [
      { vendor: '台达 Delta', title: '台达官网下载', url: 'https://www.deltaww.com/zh-CN/download', status: 'warn', note: '请求失败（疑似反爬），浏览器可尝试' },
      { vendor: 'EBM-Papst', title: '轴流风机', url: 'https://www.ebmpapst.com/cn/zh/products/axial-fans.html', status: 'warn', note: '未联网复核' },
      { vendor: '建准 Sunon', title: '风扇产品', url: 'https://www.sunon.com/product/', status: 'warn', note: '未联网复核' },
    ],
    '电池簇 / BAMS': [
      { vendor: '宁德时代 CATL', title: 'CATL 官网', url: 'https://www.catl.com/en/', status: 'ok', note: '官网实测可达；电池簇/BCU 无公开展品手册，仅供企业资料' },
      { vendor: '比亚迪 BYD', title: '储能系统', url: 'https://www.byd.com/energy/energy-storage', status: 'warn', note: '未联网复核' },
    ],
    '人机界面 HMI': [
      { vendor: '威纶通 Weinview', title: '威纶通官网', url: 'https://www.weinview.cn/', status: 'ok', note: '实测可达（download.aspx 重定向至首页）' },
    ],
    '工业路由器': [
      { vendor: '有人 USR', title: '有人物联网下载中心', url: 'https://www.usr.cn/Download/', status: 'warn', note: '反爬 403（nginx），浏览器可开' },
      { vendor: '华为', title: 'AR 系列路由器', url: 'https://e.huawei.com/cn/products/enterprise-networking/routers/ar-series', status: 'warn', note: '未联网复核' },
    ],
    '急停按钮 / 门禁开关': [
      { vendor: '施耐德', title: '施耐德文档下载中心', url: 'https://www.se.com/cn/zh/download/', status: 'ok', note: '实测可达（重定向至 schneider-electric.cn）' },
    ],
    '接线端子 / 母排附件': [
      { vendor: 'Phoenix Contact', title: '端子与连接', url: 'https://www.phoenixcontact.com/zh-cn/', status: 'ok', note: '官网实测可达' },
      { vendor: '菲尼克斯(产品页)', title: '大电流接线端子', url: 'https://www.phoenixcontact.com/zh-cn/products/terminal-blocks/power-terminal-blocks', status: 'warn', note: '未联网复核' },
    ],
    '泄放电阻 / 预充电阻': [
      { vendor: 'Vishay', title: 'Vishay 电阻', url: 'https://www.vishay.com/resistors/', status: 'warn', note: '/en/resistors 实测 403，浏览器可尝试根路径' },
      { vendor: '国巨 Yageo', title: '电阻产品', url: 'https://www.yageo.com/zh-CN/Product/Index/12', status: 'warn', note: '未联网复核' },
    ],
    'CCU 充电控制单元': [
      { vendor: '泰坦科技 Titans', title: '泰坦官网', url: 'https://www.titans.com.cn/', status: 'ok', note: '官网实测可达（充电产品方案页）' },
      { vendor: 'Vector', title: 'VSECC', url: 'https://www.vector.com/cn/zh/products/products-a-z/embedded-components/vsecc/', status: 'warn', note: '未联网复核' },
    ],
    '计量通信网关': [
      { vendor: '西门子', title: 'Emobility 方案', url: 'https://www.siemens.com/global/en/products/energy/medium-voltage/solutions/emobility.html', status: 'warn', note: '未联网复核' },
    ],
    /* ---------- 辅助/参考设计 ---------- */
    '参考设计（TI/ST）': [
      { vendor: 'TI', title: 'EV 充电站电源模块方案', url: 'https://www.ti.com/solution/ev-charging-station-power-module', status: 'warn', note: 'TI 官方方案页，未联网复核' },
      { vendor: 'ST', title: 'EV 充电站参考设计', url: 'https://www.st.com/content/st_com/en/solutions/reference-designs/ev-charging-station-reference-design.html', status: 'warn', note: '未联网复核' },
    ],
    '断路器 MCCB/MCB': [
      { vendor: 'ABB', title: 'ABB Library 检索', url: 'https://library.abb.com/', status: 'ok', note: 'ABB 产品页改版 404，统一 Library 检索' },
      { vendor: '施耐德', title: 'Compact NSX', url: 'https://www.se.com/cn/zh/product-range/62128-compact-nsx/', status: 'warn', note: '未联网复核' },
      { vendor: '西门子', title: '3VA 塑壳断路器', url: 'https://www.siemens.com/cn/zh/products/energy/low-voltage/components/3va-mccb.html', status: 'warn', note: '未联网复核' },
    ],
  };

  /* ---------- API ---------- */
  /* 品类别名：设备名关键词 → KB 品类（按关键词长度降序匹配，先长后短） */
  const ALIAS = {
    '直流总快速熔断器': '直流快熔', '直流快熔': '直流快熔', '快速熔断器': '直流快熔', '总快速熔断': '直流快熔', '快熔': '直流快熔', '熔断器': '直流快熔', '熔断': '直流快熔',
    '电源电涌保护器': '电涌保护器 SPD', '电涌保护': '电涌保护器 SPD', '电涌': '电涌保护器 SPD', 'SPD': '电涌保护器 SPD',
    '泄放电阻': '泄放电阻 / 预充电阻', '预充电阻': '泄放电阻 / 预充电阻', '电阻': '泄放电阻 / 预充电阻',
    '绝缘监测': '绝缘监测 IMD', 'IMD': '绝缘监测 IMD', '剩余电流监测': '剩余电流监测 RCM', '剩余电流': '剩余电流监测 RCM', 'RCM': '剩余电流监测 RCM',
    '霍尔电流传感器': '霍尔电流传感器', '电流传感器': '霍尔电流传感器', '传感器': '霍尔电流传感器',
    '直流电能表': '电能表', '交流电能表': '电能表', '电能表': '电能表',
    '充电功率模块': '充电功率模块', '功率模块': '充电功率模块', '充电模块': '充电功率模块',
    '直流接触器': '直流接触器', '接触器': '直流接触器',
    '交流主接触器': '交流主接触器', '主接触器': '交流主接触器',
    'EMC 滤波器': 'EMC 滤波器', 'EMC': 'EMC 滤波器', '滤波器': 'EMC 滤波器', '防雷': 'EMC 滤波器',
    '开关电源': '开关电源', '电源 DC': '开关电源', 'DC12V': '开关电源', 'DC24V': '开关电源',
    '热管理风机': '风机', '轴流风机': '风机', '风机': '风机',
    '双向 DC/DC': '储能 PCS / DC/DC', 'DC/DC': '储能 PCS / DC/DC', 'PCS': '储能 PCS / DC/DC', '储能': '储能 PCS / DC/DC',
    '电池管理主控': '电池簇 / BAMS', 'BAMS': '电池簇 / BAMS', '电池簇': '电池簇 / BAMS', '电池': '电池簇 / BAMS',
    '4G/以太网路由器': '工业路由器', '路由器': '工业路由器', '4G': '工业路由器',
    '人机界面': '人机界面 HMI', '显示屏': '人机界面 HMI', 'HMI': '人机界面 HMI',
    '充电控制导引单元': 'CCU 充电控制单元', '充电控制单元': 'CCU 充电控制单元', 'CCU': 'CCU 充电控制单元', '导引单元': 'CCU 充电控制单元', '短路检测': 'CCU 充电控制单元', '粘连检测': 'CCU 充电控制单元',
    '通信网关': '计量通信网关', '网关': '计量通信网关',
    '急停按钮': '急停按钮 / 门禁开关', '门禁': '急停按钮 / 门禁开关', '防拆': '急停按钮 / 门禁开关', '急停': '急停按钮 / 门禁开关', '指示灯': '急停按钮 / 门禁开关',
    '充电连接器': '充电枪', '连接器': '充电枪', '电子锁': '充电枪', '充电枪': '充电枪',
    '储能直流母线': '接线端子 / 母排附件', '充电直流主母线': '接线端子 / 母排附件', '交流分配母线': '接线端子 / 母排附件', '直流汇流排': '接线端子 / 母排附件', '汇流排': '接线端子 / 母排附件', '接线端子': '接线端子 / 母排附件', '端子排': '接线端子 / 母排附件', '端子': '接线端子 / 母排附件', '母排': '接线端子 / 母排附件', '母线': '接线端子 / 母排附件', '汇流': '接线端子 / 母排附件', '接地排': '接线端子 / 母排附件', '等电位': '接线端子 / 母排附件',
    '塑壳断路器': '断路器 MCCB/MCB', '断路器': '断路器 MCCB/MCB', '隔离开关': '断路器 MCCB/MCB',
    'TI 参考设计': '参考设计（TI/ST）', 'ST 参考设计': '参考设计（TI/ST）', '参考设计': '参考设计（TI/ST）',
  };
  /* 清洗品类键：去（）后缀 / /后缀 / 空白 / 尾部编号 */
  function clean(s) {
    return String(s || '').replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '').split('/')[0].replace(/[\s·,，、_-]+/g, '').replace(/[A-Z0-9]{2,}$/, '');
  }
  function pick(row) {
    if (!row) return null;
    const cat = row.cat || '', name = row.name || '';
    const vendors = (row.vendors || []).map(function (v) { return String(v); });
    const nk = clean(name);
    function vendMatch(e) {
      if (!e.vendor) return false;
      for (let j = 0; j < vendors.length; j++) {
        if (vendors[j] && (vendors[j].indexOf(e.vendor) >= 0 || e.vendor.indexOf(vendors[j]) >= 0)) return true;
      }
      return false;
    }
    /* 1) 定品类：别名优先，其次清洗双向匹配 */
    let catKey = null;
    Object.keys(ALIAS).sort(function (a, b) { return b.length - a.length; }).forEach(function (kw) {
      if (!catKey && (name.indexOf(kw) >= 0 || nk.indexOf(kw) >= 0)) catKey = ALIAS[kw];
    });
    if (!catKey) {
      let bestScore = 0;
      Object.keys(KB).forEach(function (c) {
        const ck = clean(c);
        let sc = 0;
        if (nk && ck && nk.length >= 2 && ck.length >= 2 && (nk.indexOf(ck) >= 0 || ck.indexOf(nk) >= 0)) sc += 4;
        const ckCat = clean(cat);
        if (ckCat && ck && (ck.indexOf(ckCat) >= 0 || ckCat.indexOf(ck) >= 0)) sc += 2;
        if (sc > bestScore) { bestScore = sc; catKey = c; }
      });
      if (bestScore <= 0) catKey = null;
    }
    /* 2) 品类内：厂家匹配优先，其次 ok>warn>nohref */
    if (catKey && KB[catKey] && KB[catKey].length) {
      const entries = KB[catKey];
      for (let i = 0; i < entries.length; i++) { if (vendMatch(entries[i])) return entries[i]; }
      const rank = { ok: 0, warn: 1, nohref: 2 };
      let out = null;
      entries.forEach(function (e) { if (!out || (rank[e.status] || 1) < (rank[out.status] || 1)) out = e; });
      return out;
    }
    /* 3) 无品类：全局厂家兜底（仅 ok，防误伤） */
    let gbest = null;
    Object.keys(KB).forEach(function (c) {
      if (gbest) return;
      KB[c].forEach(function (e) { if (!gbest && e.status === 'ok' && vendMatch(e)) gbest = e; });
    });
    return gbest || null;
  }

  function merge(json) {
    if (!json || typeof json !== 'object') return 0;
    let n = 0;
    Object.keys(json).forEach(function (cat) {
      const arr = json[cat];
      if (!Array.isArray(arr)) return;
      KB[cat] = KB[cat] || [];
      arr.forEach(function (e) {
        if (!e || !e.vendor) return;
        const idx = KB[cat].findIndex(function (x) { return x.vendor === e.vendor; });
        if (idx >= 0) KB[cat][idx] = Object.assign({}, KB[cat][idx], e); else KB[cat].push(Object.assign({ status: 'warn' }, e));
        n++;
      });
    });
    return n;
  }

  function load(url, cb) {
    if (typeof fetch !== 'function') { if (cb) cb(new Error('no fetch')); return; }
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      const n = merge(j);
      if (cb) cb(null, n);
    }).catch(function (e) { if (cb) cb(e); });
  }

  function list() { return JSON.parse(JSON.stringify(KB)); }
  function version() { return { version: VER, checked: CHECKED, cats: Object.keys(KB).length }; }

  return { VERSION: VER, CHECKED: CHECKED, KB: KB, pick: pick, merge: merge, load: load, list: list, version: version };
})();