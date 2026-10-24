/* ============================================================
 * EVSE 厂家电路对比知识库 v1.0
 * ------------------------------------------------------------
 * 来源：用户《对比.docx》（已拆分，本版并入 对比2.docx）
 *   厂家样本：深圳佳诺 · 公牛 · 普诺德 · 万邦 · 科大智能 · EN科技 · 小鹏
 *   层级：交流充电桩控制板（板级），与 evse-core 的系统级直流原理图互补
 *   证据：word/media 95 张电路截图 + 88 段文字说明
 *
 * 定位：这是**方案取舍知识库**，用于
 *   ① 给原理图补齐「功能安全检测单元」清单（G 维度规则）
 *   ② 在平台里对比各家拓扑优劣，作为选型评审输入
 * 不是标准符合性结论，不是厂家型号推荐，不构成认证依据。
 * ============================================================ */
window.EVSE_VENDOR_KB = (function () {
  'use strict';

  const VERSION = '1.0.0';
  const VENDORS = ['深圳佳诺', '公牛', '普诺德', '万邦', '科大智能', 'EN科技', '小鹏'];

  /* v: 各家做法 · pro/con: 优劣 · verdict: 判定倾向 */
  const BLOCKS = [
    {
      id: 'FB-EMC', name: '交流进线 EMC / 防雷前端', must: true,
      role: '抑制传导与浪涌，决定 EMC 与雷击存活率',
      variants: [
        { t: 'NTC + 共模 + X电容(220nF) + X电容(680nF) + 600V GDT', who: ['科大智能'], pro: ['成本最低', '体积小'], con: ['无 Y 电容，传导发射容易不过', '共模路径缺失'], score: 2 },
        { t: 'NTC + 共差模(VRY+VRX) + (CX+CY) + 压敏 + 3500V GDT', who: ['EN科技'], pro: ['共差模齐备', 'GDT 电压等级高，雷击能力强'], con: ['器件数多，成本高'], score: 5 },
        { t: 'NTC + 压敏 + 共差模(VRY+VRX) + (CX+CY) + 防浪涌电阻 + 600V GDT', who: ['小鹏'], pro: ['带防浪涌电阻，限制冲击电流', '级联配合清晰'], con: ['防浪涌电阻发热需评估'], score: 4 }
      ],
      rules: [
        { id: 'V-EMC-01', level: 'BLOCKING', text: '交流进线必须同时具备差模(X)与共模(Y)电容路径；缺 Y 电容判不合格（科大智能方案实证风险）。' },
        { id: 'V-EMC-02', level: 'WARN', text: 'GDT 标称电压与压敏残压必须配合；600V GDT 单独使用时雷击余量偏低。' },
        { id: 'V-EMC-03', level: 'WARN', text: 'NTC 与防浪涌电阻的稳态温升需与外壳散热一并核算。' }
      ]
    },
    {
      id: 'FB-SC', name: '充电前输出短路检测', must: true,
      role: '能量传输前确认输出 L-N 未短路，避免带载合闸',
      variants: [
        { t: '光耦隔离导通检测', who: ['深圳佳诺'], pro: ['隔离好', '电路最简'], con: ['阈值受光耦 CTR 离散影响'], score: 4 },
        { t: '双继电器 + 隔离驱动（检测完即断开，不参与能量传输）', who: ['普诺德'], pro: ['检测回路与主回路彻底解耦，不干扰主板', '安全性最高'], con: ['多两只继电器，成本与体积上升'], score: 5 },
        { t: '三极管驱动 + 光耦隔离', who: ['万邦'], pro: ['驱动简单，成本低'], con: ['无独立隔离电源时共地风险'], score: 3 },
        { t: '整流桥 + 光耦导通检测', who: ['公牛'], pro: ['不分极性，适应双向接线'], con: ['整流桥压降影响判据线性'], score: 3 },
        { t: '运放差分检测 + 光耦隔离', who: ['小鹏'], pro: ['判据精确，可读电阻量级'], con: ['运放需精密基准，成本最高'], score: 4 }
      ],
      rules: [
        { id: 'V-SC-01', level: 'BLOCKING', text: '必须存在「合闸前输出短路检测」单元，且检测回路在能量传输阶段可与主回路断开（普诺德双继电器方案为最优范式）。' },
        { id: 'V-SC-02', level: 'BLOCKING', text: '检测回路必须与主回路电气隔离（光耦/隔离电源），信号地不得与主回路直接共地。' },
        { id: 'V-SC-03', level: 'WARN', text: '判据必须给出「短路/未短路」的电阻阈值与光耦 CTR 离散度余量。' }
      ]
    },
    {
      id: 'FB-PE', name: '接地（PE）检测', must: true,
      role: '确认 PE 有效连接，是漏电保护动作的前提',
      variants: [
        { t: '高阻分压漏电检测（Ei6 PE_CHK）', who: ['深圳佳诺'], pro: ['成本低，占板小'], con: ['受电网不平衡与共模干扰影响'], score: 3 },
        { t: '阻容耦合电流检测', who: ['公牛'], pro: ['抗直流偏置'], con: ['电容老化导致判据漂移'], score: 3 },
        { t: '差分放大精密检测（双运放隔离）', who: ['普诺德'], pro: ['精度与抗干扰最好', '可给出定量阻值'], con: ['成本最高'], score: 5 },
        { t: '单运放缓冲电流检测（简易隔离）', who: ['万邦'], pro: ['折中方案'], con: ['共模抑制比有限'], score: 4 },
        { t: '二极管钳位限幅检测（纯硬件保护）', who: ['科大智能'], pro: ['无需软件参与，失效安全'], con: ['只能判有无，不能判质量'], score: 2 },
        { t: '传统阻容方式', who: ['万邦'], pro: ['成熟'], con: ['判据粗糙'], score: 2 }
      ],
      rules: [
        { id: 'V-PE-01', level: 'BLOCKING', text: '必须有独立 PE 有效性检测通道，且检测结果送控制单元参与允许充电判据。' },
        { id: 'V-PE-02', level: 'WARN', text: '仅「有/无」二值判据不足；应能给出阻值量级（差分放大方案为优）。' },
        { id: 'V-PE-03', level: 'BLOCKING', text: 'PE 检测不得依靠颜色或标注表达连通性，必须在图上有实体检测单元与走线。' }
      ]
    },
    {
      id: 'FB-STICK', name: '继电器/接触器粘连检测', must: true,
      role: '触点熔焊后仍能断电，是最关键的失效安全项',
      variants: [
        { t: '高阻分压 + TVS 保护', who: ['深圳佳诺'], pro: ['简单可靠，TVS 抑制浪涌'], con: ['高阻分压易受干扰'], score: 4 },
        { t: '阻容耦合 + TVS 钳位', who: ['公牛'], pro: ['隔直通交，适合交流判据'], con: ['电容失效即失去检测'], score: 3 },
        { t: '光耦隔离导通检测', who: ['小鹏'], pro: ['隔离，逻辑电平直出'], con: ['阈值离散'], score: 4 },
        { t: '防浪涌电容 + 阻容分压 + ADC 采样', who: ['小鹏'], pro: ['定量采样，可做趋势诊断'], con: ['需 ADC 与软件滤波'], score: 5 },
        { t: '整流桥 + 光耦导通检测', who: ['万邦', '科大智能'], pro: ['不分极性'], con: ['压降影响判据'], score: 3 },
        { t: '运放(比较器)判断 L1 粘连；N 线对 PE 也检测', who: ['普诺德'], pro: ['双极同时判断'], con: ['N 对 PE 本来 0V，能否真正判出 N 粘连存疑（原文已质疑）'], score: 2 }
      ],
      rules: [
        { id: 'V-ST-01', level: 'BLOCKING', text: '每个输出接触器/继电器必须有粘连（触点熔焊）检测，且两极均需覆盖。' },
        { id: 'V-ST-02', level: 'BLOCKING', text: '粘连检测判据必须物理可行：以 N 对 PE 电压判 N 极粘连不成立（普诺德方案实证疑点）。' },
        { id: 'V-ST-03', level: 'WARN', text: '优先定量采样（ADC）而非纯阈值比较，便于寿命趋势诊断。' },
        { id: 'V-ST-04', level: 'BLOCKING', text: '检测支路入口必须有 TVS 或等效浪涌钳位。' }
      ]
    },
    {
      id: 'FB-DRV', name: '继电器驱动电路', must: true,
      role: '驱动能力与关断续流决定触点寿命',
      variants: [
        { t: '三极管推挽电路', who: ['万邦'], pro: ['驱动强，开关快'], con: ['需续流回路，否则反峰打器件'], score: 4 },
        { t: '三极管开关 + 续流二极管', who: ['深圳佳诺', '公牛', '普诺德', '小鹏'], pro: ['成本低，最常见'], con: ['关断速度受续流回路限制'], score: 3 }
      ],
      rules: [
        { id: 'V-DRV-01', level: 'BLOCKING', text: '每个线圈必须画出续流/钳位回路（二极管或 RC），图上不得只有线圈两端子。' },
        { id: 'V-DRV-02', level: 'WARN', text: '驱动级与控制器之间宜有隔离或限流，防止单点故障导致误合闸。' }
      ]
    },
    {
      id: 'FB-RCD', name: '漏电保护（含直流分量）', must: true,
      role: 'Type B / 6mA DC 检测，人身安全底线',
      variants: [
        { t: '专用漏电保护模块 + 硬线切除', who: ['深圳佳诺', '普诺德', '小鹏'], pro: ['动作路径不依赖软件'], con: ['成本与体积'], score: 5 },
        { t: '漏电继电器（外置）', who: ['万邦'], pro: ['选型灵活'], con: ['需确认含直流分量检测能力'], score: 3 }
      ],
      rules: [
        { id: 'V-RCD-01', level: 'BLOCKING', text: '漏电保护动作必须有不经软件的硬线切除路径。' },
        { id: 'V-RCD-02', level: 'BLOCKING', text: '直流桩/带 DC 分量场合必须明确 Type B 或 6mA DC 检测能力。' }
      ]
    },
    {
      id: 'FB-AUX', name: '辅助电源拓扑', must: true,
      role: '控制板供电，失效即全站失效',
      variants: [
        { t: '自激式多路输出辅助电源', who: ['科大智能'], pro: ['器件极少，成本最低'], con: ['纹波与稳压差，负载跳变时易掉电'], score: 2 },
        { t: '反激式隔离电源', who: ['深圳佳诺'], pro: ['隔离好，最通用'], con: ['单路故障即全失'], score: 4 },
        { t: '反激式组合电源', who: ['公牛'], pro: ['多路兼顾'], con: ['交叉调整率差'], score: 3 },
        { t: '双路反激式辅助电源', who: ['普诺德', '小鹏'], pro: ['冗余，单路故障不致停机'], con: ['成本最高'], score: 5 },
        { t: '集成式反激电源', who: ['EN科技'], pro: ['面积小，一致性好'], con: ['芯片单点依赖'], score: 4 }
      ],
      rules: [
        { id: 'V-AUX-01', level: 'BLOCKING', text: '辅助电源必须隔离，且 24V/12V 分列供电，禁止从功率母线直接取电。' },
        { id: 'V-AUX-02', level: 'WARN', text: '安全相关回路（急停、漏电、粘连检测）宜由冗余/独立辅源供电（双路反激为优）。' },
        { id: 'V-AUX-03', level: 'WARN', text: '自激式方案纹波大，不宜给 ADC 采样链供电。' }
      ]
    },
    {
      id: 'FB-CP-GEN', name: '控制导引 CP 发生电路', must: true,
      role: '±12V 1kHz PWM 质量决定与车辆的互操作性',
      variants: [
        { t: '运放 + 二极管钳位驱动', who: ['深圳佳诺'], pro: ['波形干净，钳位明确'], con: ['驱动能力弱，长电缆下边沿变差'], score: 4 },
        { t: '三极管推挽 + LC 滤波（Q5E/Q3E/Q2E）', who: ['公牛'], pro: ['驱动强，抗容性负载'], con: ['LC 引入延时与过冲'], score: 4 },
        { t: '运放 + 三极管图腾柱', who: ['万邦'], pro: ['边沿快，负载能力强'], con: ['需防直通与限流'], score: 5 },
        { t: '运放 + 三极管推挽（U13A + Q11/Q12/Q13/Q14）', who: ['小鹏'], pro: ['对称推挽，波形稳定'], con: ['器件多'], score: 5 }
      ],
      rules: [
        { id: 'V-CP-01', level: 'BLOCKING', text: 'CP 发生级必须有明确钳位（±12V）与限流，禁止运放直驱长电缆。' },
        { id: 'V-CP-02', level: 'WARN', text: '推挽级必须给出防直通措施；LC 滤波需核算边沿延时对占空比判读的影响。' }
      ]
    },
    {
      id: 'FB-CP-DET', name: '控制导引 CP 检测电路', must: true,
      role: '读回车辆状态（A/B/C/D/E/F）',
      variants: [
        { t: '运放跟随 + 二极管整流（峰值检测）', who: ['深圳佳诺'], pro: ['抗噪，读峰值稳定'], con: ['丢失波形细节，难判占空比异常'], score: 3 },
        { t: '运放跟随 + 电阻分压（线性采样）', who: ['公牛'], pro: ['保留波形，可判占空比与状态'], con: ['需高速 ADC'], score: 5 },
        { t: '运放比较 + 基准电压（幅值阈值检测）', who: ['万邦'], pro: ['判据硬件化，失效安全'], con: ['只能分档，不能定量'], score: 4 },
        { t: '运放跟随 + 二极管输出（信号调理）', who: ['小鹏'], pro: ['电路简单'], con: ['二极管压降引入固定偏差'], score: 3 }
      ],
      rules: [
        { id: 'V-CPD-01', level: 'BLOCKING', text: 'CP 检测必须能区分车辆状态档位并把结果送控制单元；仅峰值检测不足以判占空比异常。' },
        { id: 'V-CPD-02', level: 'WARN', text: '线性采样方案需给出采样率与抗别频措施。' }
      ]
    },
    {
      id: 'FB-DIODE', name: '车辆二极管存在检测', must: true,
      role: '防止用电阻假冒车辆（安全强制项）',
      variants: [
        { t: '双运放精密滞回比较', who: ['深圳佳诺'], pro: ['抗抖动，判据稳'], con: ['成本较高'], score: 5 },
        { t: '单运放开环放大钳位', who: ['公牛'], pro: ['简单'], con: ['易受噪声误判'], score: 3 },
        { t: '三极管开关电平转换', who: ['万邦'], pro: ['最省成本'], con: ['温漂大'], score: 2 }
      ],
      rules: [
        { id: 'V-DI-01', level: 'BLOCKING', text: '必须有车辆二极管存在检测；缺失即视为可被电阻假冒，判不合格。' },
        { id: 'V-DI-02', level: 'WARN', text: '比较级宜带滞回，避免边界抖动导致反复启停。' }
      ]
    },
    {
      id: 'FB-CT', name: '电流互感器 / 计量与过流', must: false,
      role: '过流保护与计量',
      variants: [
        { t: '电流互感器 + 运放调理', who: ['万邦'], pro: ['隔离，成本适中'], con: ['直流分量无法检测'], score: 4 }
      ],
      rules: [{ id: 'V-CT-01', level: 'WARN', text: '互感器方案无法检测直流分量，直流场合需换霍尔或分流器。' }]
    },
    {
      id: 'FB-BLEED', name: '泄放电路', must: true,
      role: '停机后把母线/电容泄放到安全电压',
      variants: [{ t: '泄放电阻 + 泄放接触器', who: ['EN科技'], pro: ['明确可控'], con: ['阻值需按电容量核算'], score: 4 }],
      rules: [{ id: 'V-BL-01', level: 'BLOCKING', text: '必须有泄放回路并给出泄放时间与目标安全电压；阻值需按储能电容量核算。' }]
    },
    {
      id: 'FB-CARD', name: '刷卡 / 鉴权电路', must: false,
      role: '计费与鉴权',
      variants: [{ t: '刷卡电路（RFID）', who: ['万邦'], pro: ['离线可用'], con: ['需与后台鉴权冗余'], score: 3 }],
      rules: [{ id: 'V-CD-01', level: 'WARN', text: '鉴权失效时必须有明确的降级策略（拒绝启动或离线白名单）。' }]
    }
  ];

  /* 把知识库映射到系统级原理图的「必备功能单元」检查 */
  const G_CHECKS = [
    { id: 'G01', block: 'FB-SC', title: '合闸前输出短路 / 绝缘检测单元在图', need: ['SC', 'RI1'], note: '直流桩由 IMD 承担绝缘检测；交流桩需独立输出短路检测（普诺德双继电器范式）' },
    { id: 'G02', block: 'FB-STICK', title: '接触器粘连（触点熔焊）检测单元在图', need: ['KF'], note: '每个输出接触器两极都需覆盖；仅辅助触点反馈不等于粘连检测' },
    { id: 'G03', block: 'FB-PE', title: 'PE 有效性检测通道在图且送控制器', need: ['PEC1'], note: '差分放大精密检测为优' },
    { id: 'G04', block: 'FB-DRV', title: '线圈续流 / 钳位回路在图', need: [], note: '每个线圈符号内置续流二极管（阴极朝 A1），由符号库构造保证' },
    { id: 'G05', block: 'FB-CP-GEN', title: '导引发生级（CP / CC）在图', need: ['CG'], note: 'GB 为 CC1/CC2 + S± CAN；CCS 为 CP PWM/PLC；必须有 ±12V 钳位与限流' },
    { id: 'G06', block: 'FB-CP-DET', title: '导引检测级在图并送控制器', need: ['CG'], note: '需能区分车辆状态档位；仅峰值检测判不出占空比异常' },
    { id: 'G07', block: 'FB-DIODE', title: '车辆二极管存在检测在图', need: ['CG'], note: '防止用电阻假冒车辆；直流桩另由 BMS 握手交叉验证' },
    { id: 'G08', block: 'FB-RCD', title: '漏电保护硬线切除路径在图', need: ['RCM1'], note: '动作不得依赖软件' },
    { id: 'G09', block: 'FB-AUX', title: '辅助电源隔离且 24V/12V 分列', need: ['T1', 'T2'], note: '安全回路宜由冗余辅源供电' },
    { id: 'G10', block: 'FB-BLEED', title: '泄放回路在图', need: ['K0', 'RS0'], note: '阻值按电容量核算' },
    { id: 'G11', block: 'FB-EMC', title: '进线 EMC：差模(X)+共模(Y)+压敏+GDT 齐备', need: ['FE1', 'FV1'], note: '缺 Y 电容即判不合格（科大智能方案实证风险）；串联共模扣在 SPD/滤波模块规格内' }
  ];

  function allRules() {
    const out = [];
    BLOCKS.forEach(function (b) { b.rules.forEach(function (r) { out.push(Object.assign({ block: b.id, blockName: b.name }, r)); }); });
    return out;
  }
  function best(blockId) {
    const b = BLOCKS.filter(function (x) { return x.id === blockId; })[0];
    if (!b) return null;
    return b.variants.slice().sort(function (m, n) { return n.score - m.score; })[0];
  }

  return { VERSION, VENDORS, BLOCKS, G_CHECKS, allRules, best };
})();
