/* ============================================================
 * EVSE BOM 汇总引擎 v1.0
 * ------------------------------------------------------------
 * 从 pin 级设计模型汇总为工程 BOM：
 *   类别 · 设备名称 · 型号参考 · 推荐厂家 · 关键参数 · 数量 · 说明 · 手册链接
 *
 * 诚实边界（重要）：
 *   · 关键参数 / 数量 —— 由设计模型**计算得出**，真实可追溯。
 *   · 推荐厂家 —— 该品类在充电桩供应链中的**常见候选厂家**，非推荐背书、非授权关系。
 *   · 型号参考 —— 仅到**系列级**，且一律标注需核实；平台不编造具体订货号。
 *   · 手册链接 —— 生成**可用的检索链接**，不编造 PDF 直链。
 *     接入大模型 + 联网检索后，可由 AI 回填具体型号与手册直链（仍需人工核验）。
 * ============================================================ */
window.EVSE_BOM = (function () {
  'use strict';

  const VERSION = '1.0.0';

  /* 类别定义（出图顺序） */
  const CATS = [
    'AC 进线与保护', '计量与监测', '功率变换', '直流保护与汇流',
    '充电枪回路', '功能安全检测', '储能系统', '二次控制与通信',
    '辅助电源与热管理', '母排与接地', '端子与结构件'
  ];

  /* 器件分类知识库：pattern → 类别 / 型号参考(系列级) / 候选厂家 / 说明 */
  const KB = [
    { re: /^XT\d/, cat: 'AC 进线与保护', series: '导轨式大电流接线端子（栅栏式 / 弹簧式）', vendors: ['菲尼克斯 Phoenix Contact', '魏德米勒 Weidmüller', '威腾 Wonke', '正泰 CHNT'], note: '按进线电缆截面选端子规格；PE 端子须与柜体等电位可靠连接' },
    { re: /^QS\d/, cat: 'AC 进线与保护', series: '负荷隔离开关（可见断点、可挂锁）', vendors: ['ABB (OT/OS 系列)', '施耐德 Schneider', '伊顿 Eaton', '正泰 CHNT'], note: '须具备可见断点与挂锁功能，满足检修隔离要求' },
    { re: /^QF1$/, cat: 'AC 进线与保护', series: '塑壳断路器 MCCB（可调过载 + 短路瞬动）', vendors: ['ABB (Tmax)', '施耐德 (NSX)', '西门子 Siemens (3VA)', '常熟开关 CSKG'], note: 'Icu 须按接入点短路容量计算后确定，本平台不给整定值' },
    { re: /^QF\d/, cat: 'AC 进线与保护', series: '微型断路器 MCB（SPD 后备保护）', vendors: ['ABB', '施耐德 Schneider', '西门子 Siemens'], note: '后备保护须与 SPD 通流能力配合，遵循 SPD 厂家推荐值' },
    { re: /^FV\d/, cat: 'AC 进线与保护', series: '电源电涌保护器 SPD（T2，插拔模块式）', vendors: ['OBO Bettermann', 'DEHN', '菲尼克斯 Phoenix Contact', '雷迅 LSP'], note: 'Up 须低于被保护设备耐冲击电压；须带遥信触点接入监控' },
    { re: /^FE\d/, cat: 'AC 进线与保护', series: '三相 EMI 滤波器（X/Y 电容 + 共差模电感）+ 气体放电管', vendors: ['Schaffner', 'TDK-EPCOS', '赛纪 SJ', 'Bourns (GDT)'], note: 'V-EMC-01：必须同时具备差模(X)与共模(Y)路径；GDT 电压等级与压敏残压需配合' },
    { re: /^KM\d/, cat: 'AC 进线与保护', series: '交流接触器 AC-1/AC-3（4 极）', vendors: ['ABB (AF 系列)', '施耐德 Schneider', '西门子 Siemens', '正泰 CHNT'], note: '线圈 DC24V；V-DRV-01：线圈必须配续流/钳位回路' },

    { re: /^RCM\d/, cat: '计量与监测', series: '剩余电流监测装置 RCM（Type B，含直流分量）', vendors: ['Bender', '西门子 Siemens', '菲尼克斯 Phoenix Contact', '珠海泰坦'], note: 'V-RCD-01：动作须有不经软件的硬线切除路径；直流场合必须 Type B 或 6mA DC 检测' },
    { re: /^PJ1$/, cat: '计量与监测', series: '三相四线导轨电能表（RS485 / DL-T645）', vendors: ['威胜 Wasion', '林洋 Linyang', '江苏智臻', '华立 Holley'], note: '贸易结算用途须具备计量器具型式批准（CPA）与首检合格证' },
    { re: /^PJ2$/, cat: '计量与监测', series: '直流电能表 1000V（RS485 / DL-T645）', vendors: ['威胜 Wasion', '江苏智臻', '林洋 Linyang', '科陆 Clou'], note: '直流计费须符合当地计量法规；分流器/传感器须与表配套检定' },
    { re: /^TA\d/, cat: '计量与监测', series: '开环霍尔电流传感器（直流 ±xxxA）', vendors: ['LEM', 'Honeywell', '森社 Sensor', '南京中旭'], note: 'V-AUX-03：供电须取自低纹波辅源，不得用自激式电源' },
    { re: /^RI\d/, cat: '计量与监测', series: '直流绝缘监测装置 IMD（DC 1000V）', vendors: ['Bender (isoEV)', '珠海泰坦', '深圳鸿鹏', '西安爱科'], note: '判据阈值须按 GB/T 18487.1 与项目要求确认；须有独立告警硬触点' },

    { re: /^M[1-8]$/, cat: '功率变换', series: '充电模块 AC/DC（宽范围恒功率，风冷/液冷）', vendors: ['英飞源 Infypower', '优优绿能 UUGreen', '通合科技 Tonhe', '华为数字能源', '永联 Winline'], note: '输出电压范围须覆盖目标车型电池电压窗口；并机数量与均流精度须厂家确认' },
    { re: /^M9$/, cat: '储能系统', series: '双向 DC/DC 变换器 / 储能 PCS', vendors: ['盛弘 Sinexcel', '科华数据 Kehua', '上能电气 Sineng', '英飞源 Infypower'], note: 'V-AUX-01：须隔离；并网侧须满足当地并网导则与防孤岛要求' },
    { re: /^T[12]$/, cat: '辅助电源与热管理', series: '导轨式开关电源（反激隔离，24V / 12V）', vendors: ['明纬 MEAN WELL', '菲尼克斯 Phoenix Contact', '西门子 Siemens (SITOP)', '台达 Delta'], note: 'V-AUX-02：安全相关回路（急停/漏电/粘连检测）宜由冗余或独立辅源供电' },
    { re: /^MF\d/, cat: '辅助电源与热管理', series: '轴流风机 / 离心风机（DC24V，带转速反馈）', vendors: ['台达 Delta', 'ebm-papst', '三协 Sanyo Denki', '奇宏 AVC'], note: '风量须按柜内热耗与允许温升核算；宜带堵转告警' },

    { re: /^FU1$/, cat: '直流保护与汇流', series: '直流快速熔断器 aR（1000VDC，方体/圆筒）', vendors: ['Bussmann (Eaton)', 'Littelfuse', 'SIBA', '好利 Holi'], note: '分断能力与 I²t 须与模块及电缆耐受配合；熔体座须为直流专用' },
    { re: /^FU\d/, cat: '充电枪回路', series: '直流快速熔断器 aR（枪回路专用）', vendors: ['Bussmann (Eaton)', 'Littelfuse', 'SIBA', '好利 Holi'], note: '按单枪额定电流 1.25 倍选型；须校核与枪线载流能力的配合' },
    { re: /^K0$/, cat: '直流保护与汇流', series: '小容量直流接触器（泄放回路）', vendors: ['宏发 Hongfa', 'TE Connectivity', '比亚迪弗迪', '汇之华'], note: 'V-BL-01：须给出泄放时间与目标安全电压' },
    { re: /^RS0$/, cat: '直流保护与汇流', series: '母线泄放电阻（铝壳 / 波纹）', vendors: ['Vishay', '华丰 Huafeng', '天兴 Tianxing', 'Arcol'], note: '阻值与功率须按母线电容量及允许泄放时间核算' },
    { re: /^K\dP$|^K\dN$/, cat: '充电枪回路', series: '高压直流接触器（1000VDC，带辅助触点）', vendors: ['宏发 Hongfa', 'TE Connectivity', '比亚迪弗迪 FinDreams', '汇之华 Huizhihua'], note: '正负极独立配置；线圈 DC24V 须配续流；辅助触点反馈≠粘连检测' },
    { re: /^YV\d/, cat: '充电枪回路', series: '充电枪电子锁执行器（DC12V，含锁到位反馈）', vendors: ['永贵电器 Yonggui', '中航光电 AVIC', '巴斯巴 BSBattery', '瑞可达 Recodeal'], note: '须有锁到位与解锁到位双反馈；断电后须能机械解锁' },
    { re: /^XS\d/, cat: '充电枪回路', series: '直流充电枪（国标 GB/T 20234.3 / 欧标 CCS2）', vendors: ['永贵电器 Yonggui', '中航光电 AVIC', '瑞可达 Recodeal', 'Phoenix Contact E-Mobility', 'REMA'], note: '液冷枪须同时确认冷却系统接口；枪线长度与截面按额定电流选型' },

    { re: /^KF\d/, cat: '功能安全检测', series: '接触器粘连检测单元（阻容分压 + ADC + TVS）', vendors: ['自研板卡', '珠海泰坦', '深圳鸿鹏', '英飞源 Infypower'], note: 'V-ST-01/02：正负极均须覆盖；以 N 对 PE 电压判 N 极粘连物理不成立' },
    { re: /^SC\d/, cat: '功能安全检测', series: '合闸前输出短路检测单元（双继电器 + 光耦隔离）', vendors: ['自研板卡', '珠海泰坦', '普诺德 Prond'], note: 'V-SC-01：检测回路在能量传输阶段必须可与主回路断开' },
    { re: /^PEC\d/, cat: '功能安全检测', series: 'PE 有效性检测单元（双运放差分精密检测）', vendors: ['自研板卡', 'Bender', '珠海泰坦'], note: 'V-PE-01/02：结果须参与允许充电判据；宜给出阻值量级而非仅有无' },
    { re: /^CG\d/, cat: '功能安全检测', series: '充电控制导引单元（发生 + 检测 + 车辆二极管存在）', vendors: ['自研板卡', '珠海泰坦', '深圳鸿鹏', '英飞源 Infypower'], note: 'V-CP-01/CPD-01/DI-01：须有 ±12V 钳位限流、状态档位识别、二极管存在检测' },

    { re: /^GB\d/, cat: '储能系统', series: '磷酸铁锂电池箱 / 电池簇（含 BCU）', vendors: ['宁德时代 CATL', '比亚迪 BYD', '亿纬锂能 EVE', '瑞浦兰钧 REPT', '海辰储能 HiTHIUM'], note: '须含簇级 BMS、消防探测接口与热管理接口；运输须符合危险品规定' },
    { re: /^FB\d/, cat: '储能系统', series: '电池簇熔断器 gR（直流专用）', vendors: ['Bussmann (Eaton)', 'SIBA', 'Littelfuse', '好利 Holi'], note: '须与电池簇最大放电电流及短路耐受配合' },
    { re: /^KB\d[PN]$/, cat: '储能系统', series: '电池簇主正 / 主负高压直流接触器', vendors: ['宏发 Hongfa', 'TE Connectivity', '比亚迪弗迪', '汇之华'], note: '须支持带载分断；线圈须配续流；宜带辅助触点状态回读' },
    { re: /^KB\dR$/, cat: '储能系统', series: '预充接触器（小容量直流）', vendors: ['宏发 Hongfa', 'TE Connectivity', '汇之华'], note: '预充时序由 BAMS 控制；预充完成判据须给出电压差阈值' },
    { re: /^RB\d/, cat: '储能系统', series: '预充电阻（铝壳 / 波纹，脉冲耐受型）', vendors: ['Vishay', '华丰 Huafeng', 'Arcol', '天兴 Tianxing'], note: '阻值与脉冲能量须按母线电容量与预充时间核算' },

    { re: /^A1$/, cat: '二次控制与通信', series: '充电控制单元 CCU（国标 GB/T 27930 / DIN 70121）', vendors: ['珠海泰坦', '深圳鸿鹏', '英飞源 Infypower', '自研控制器'], note: '协议版本与车辆兼容性须做互操作测试；IO 点数须留 20% 余量' },
    { re: /^A2$/, cat: '二次控制与通信', series: '计费通信网关 / SECC（OCPP 1.6J / ISO 15118）', vendors: ['珠海泰坦', '深圳鸿鹏', 'Vector', '自研控制器'], note: 'ISO 15118 需 HomePlug Green PHY 模块；须支持后台断连时的离线策略' },
    { re: /^A3$/, cat: '二次控制与通信', series: '工业级 4G/5G 路由器（含以太网交换）', vendors: ['有人物联 USR', '映翰通 InHand', '研华 Advantech', '华为'], note: '须支持 VPN / 专网接入；天线须外置并做防雷' },
    { re: /^A4$/, cat: '二次控制与通信', series: '人机交互模块（工业触摸屏 + RFID 读卡器）', vendors: ['威纶通 Weinview', '昆仑通态 MCGS', '研华 Advantech', '深圳捷易'], note: '户外须满足亮度与温度等级；读卡器须支持项目所在地卡片制式' },
    { re: /^A5$/, cat: '储能系统', series: '电池管理主控 BAMS（簇级 BCU 汇聚）', vendors: ['宁德时代 CATL', '协能科技 Sinowatt', '高特电子 Gaote', '力高新能源'], note: '须与电池厂家 BMS 协议对齐；SOC/SOH 算法精度须实测验证' },
    { re: /^SB\d/, cat: '二次控制与通信', series: '急停按钮（蘑菇头自锁，双断点常闭）', vendors: ['施耐德 Schneider (Harmony)', 'ABB', '和泉 IDEC', '正泰 CHNT'], note: 'V-RCD-01 同理：急停须硬线切除，不得仅走软件' },
    { re: /^SQ\d/, cat: '二次控制与通信', series: '门禁 / 防拆位置开关（常闭）', vendors: ['施耐德 Schneider', '和泉 IDEC', 'Omron', '正泰 CHNT'], note: '开门须触发降功率或停机；防拆须接入告警上报' },
    { re: /^HL\d/, cat: '二次控制与通信', series: '状态指示灯（DC24V 三色）', vendors: ['施耐德 Schneider', 'ABB', '和泉 IDEC'], note: '颜色含义须与运营规范一致；户外须满足可视性要求' },

    { re: /^WB\d$|^WBC$/, cat: '母排与接地', series: '铜母排 / 分配母排（含绝缘支撑）', vendors: ['按图加工（铜排 T2）', '菲尼克斯 Phoenix Contact', '魏德米勒 Weidmüller'], note: '截面须按载流量与温升核算；分相绘制对应实际分相母排' },
    { re: /^PE1$/, cat: '母排与接地', series: '保护接地铜排（等电位联结排）', vendors: ['按图加工（铜排 T2 30×4）', 'OBO Bettermann', 'DEHN'], note: '所有可触及金属部件须可靠接地；连接须可拆检且有防松措施' },
    { re: /^PE0$/, cat: '母排与接地', series: '接地极 / 接地引下线', vendors: ['土建施工方', 'OBO Bettermann', 'DEHN'], note: '接地电阻须实测；数值与做法由土建与电气共同确认' },
    { re: /^PE2$/, cat: '母排与接地', series: '二次侧保护接地端子排', vendors: ['菲尼克斯 Phoenix Contact', '魏德米勒 Weidmüller', '威腾 Wonke'], note: '须与一次侧 PE 排等电位；屏蔽层接地须单端以免环流' }
  ];

  /* 兆瓦储能方案专用分类库（family==='mwess' 时优先匹配，避免 A1-A6 与充电桩 A1-A5 撞名） */
  const MW_KB = [
    { re: /^XT\d/, cat: 'AC 进线与保护', series: '交流进线端子排（3P+N+PE 栅栏式）', vendors: ['菲尼克斯 Phoenix Contact', '魏德米勒 Weidmüller', '正泰 CHNT'], note: '按进线电缆截面选型；PE 须与柜体等电位' },
    { re: /^QS\d/, cat: 'AC 进线与保护', series: '负荷隔离开关（4P 可见断点可挂锁）', vendors: ['ABB', '施耐德 Schneider', '正泰 CHNT'], note: '检修隔离用，须可见断点' },
    { re: /^QFB\d/, cat: '储能系统', series: '储能柜直流断路器（1500VDC 快断）', vendors: ['ABB', '施耐德 Schneider', '西门子 Siemens'], note: '分断能力按母线短路容量核算' },
    { re: /^QF\d/, cat: 'AC 进线与保护', series: '进线塑壳断路器 MCCB（4P 可调过载+瞬动）', vendors: ['ABB (Tmax)', '施耐德 (NSX)', '常熟开关 CSKG'], note: 'Icu 按接入点短路容量计算' },
    { re: /^FV\d/, cat: 'AC 进线与保护', series: '电源电涌保护器 SPD（T2 3P+N）', vendors: ['OBO Bettermann', 'DEHN', '雷迅 LSP'], note: '带遥信触点接入监控' },
    { re: /^RCM\d/, cat: '计量与监测', series: '剩余电流监测装置 RCM（Type B 含直流分量）', vendors: ['Bender', '西门子 Siemens', '珠海泰坦'], note: '动作须有不经软件的硬线切除路径' },
    { re: /^PJ1$/, cat: '计量与监测', series: '三相四线交流电能表（RS485）', vendors: ['威胜 Wasion', '林洋 Linyang', '华立 Holley'], note: '贸易结算须 CPA 型式批准' },
    { re: /^PJ2$/, cat: '计量与监测', series: '直流电能表（1500V/3000A，RS485）', vendors: ['威胜 Wasion', '江苏智臻', '科陆 Clou'], note: '直流计费须符合当地计量法规' },
    { re: /^TA\d/, cat: '计量与监测', series: '开环霍尔电流传感器（直流 ±3000A）', vendors: ['LEM', 'Honeywell', '南京中旭'], note: '供电取自低纹波辅源' },
    { re: /^RI\d/, cat: '计量与监测', series: '直流绝缘监测装置 IMD', vendors: ['Bender (isoEV)', '珠海泰坦', '西安爱科'], note: '判据按 GB/T 18487.1；须有独立告警硬触点' },
    { re: /^FL\d/, cat: '直流保护与汇流', series: '储能柜直流防雷 SPD（T2 2P）', vendors: ['OBO Bettermann', 'DEHN', '菲尼克斯'], note: '直流侧 SPD，Up 须低于母线耐压' },

    { re: /^A\d$/, cat: '功率变换', series: 'AC/DC 功率模块（80kW 液冷，宽范围恒功率）', vendors: ['英飞源 Infypower', '优优绿能 UUGreen', '华为数字能源', '通合科技 Tonhe'], note: '6 台分 3 组；输出 250~1500V 覆盖电池窗口' },
    { re: /^CA\d/, cat: '二次控制与通信', series: 'AC/DC 模块 CAN 通讯盒', vendors: ['自研板卡'], note: '内部 CAN，汇聚至 PMU' },
    { re: /^D\d/, cat: '功率变换', series: '双向 DC/DC 模块（80kW，母线↔车辆可逆）', vendors: ['盛弘 Sinexcel', '英飞源 Infypower', '科华数据 Kehua'], note: '24 台；低温加热时按脉冲频率自主切换充放并同频同步' },
    { re: /^CD\d/, cat: '二次控制与通信', series: 'DC/DC 模块 CAN 通讯盒', vendors: ['自研板卡'], note: '内部 CAN，DCU/PMU 统一触发' },

    { re: /^WA\d/, cat: '直流保护与汇流', series: 'AC/DC 直流汇流排（组级，1500V）', vendors: ['按图加工（铜排 T2）'], note: '每组 2 台 160kW；截面按载流与温升核算' },
    { re: /^WB\d/, cat: '直流保护与汇流', series: '直流母线（±1500V，接 12×DC/DC + 1 储能柜）', vendors: ['按图加工（铜排 T2）'], note: '两路母线各带 12 台 DC/DC' },
    { re: /^RAIL\d/, cat: '直流保护与汇流', series: '枪侧直流汇流轨（收集各组输出至枪）', vendors: ['按图加工（铜排 T2）'], note: '每枪一轨；上限=各组功率之和' },
    { re: /^K0$/, cat: '直流保护与汇流', series: '泄放接触器（DC24V 线圈）', vendors: ['宏发 Hongfa', 'TE Connectivity'], note: '断电后泄放母线电荷至安全电压' },
    { re: /^RS0$/, cat: '直流保护与汇流', series: '母线泄放电阻', vendors: ['Vishay', '华丰 Huafeng'], note: '按母线电容量与泄放时间核算' },

    { re: /^KA\d/, cat: '二次控制与通信', series: 'AC/DC 投切接触器 → 枪（DC 1500V）', vendors: ['宏发 Hongfa', 'TE Connectivity', '比亚迪弗迪'], note: 'DCU 控制；把 AC/DC 组路由到对应枪' },
    { re: /^KB\d/, cat: '二次控制与通信', series: 'AC/DC 投切接触器 → 储能母线（DC 1500V）', vendors: ['宏发 Hongfa', 'TE Connectivity'], note: 'DCU 控制；把 AC/DC 组路由到储能柜充电' },
    { re: /^KC\d/, cat: '二次控制与通信', series: 'DC/DC 投切接触器 → 枪（可逆，DC 1500V）', vendors: ['宏发 Hongfa', 'TE Connectivity'], note: '12 进 1 出；支持向枪放电或车辆反向放电' },
    { re: /^DCU\d/, cat: '二次控制与通信', series: '开关控制单元 DCU（接触器投切/状态采集）', vendors: ['自研控制器', '珠海泰坦'], note: 'AC/DC 侧 3 进 2 出；DC/DC 侧 12 进 1 出' },
    { re: /^CCU\d/, cat: '二次控制与通信', series: '充电控制器 CCU（GB/T 27930.2 + 私有协议）', vendors: ['自研控制器', '珠海泰坦'], note: '与车 BMS 握手；控制主正/主负/电子锁' },

    { re: /^FG\d/, cat: '充电枪回路', series: '枪直流快速熔断器（1500VDC 800A）', vendors: ['Bussmann (Eaton)', 'Littelfuse', 'SIBA'], note: '按枪额定电流选型；与电缆耐受配合' },
    { re: /^KGP\d/, cat: '充电枪回路', series: '枪主正高压直流接触器（1500V 1500A）', vendors: ['宏发 Hongfa', 'TE Connectivity', '比亚迪弗迪'], note: '须支持带载分断；线圈配续流' },
    { re: /^KGN\d/, cat: '充电枪回路', series: '枪主负高压直流接触器（1500V 1500A）', vendors: ['宏发 Hongfa', 'TE Connectivity'], note: '与主正独立配置' },
    { re: /^PG\d/, cat: '计量与监测', series: '枪直流电能表（1500V 1500A，RS485）', vendors: ['威胜 Wasion', '江苏智臻', '科陆 Clou'], note: '计费计量；须 CPA 型式批准' },
    { re: /^HG\d/, cat: '计量与监测', series: '枪霍尔电流传感器（±1500A）', vendors: ['LEM', 'Honeywell', '南京中旭'], note: '供电取自低纹波辅源' },
    { re: /^XG\d/, cat: '充电枪回路', series: '液冷超级充电枪（1500V/1500A）', vendors: ['永贵电器 Yonggui', '中航光电 AVIC', '瑞可达 Recodeal'], note: '液冷须确认冷却接口；单枪峰值 2.25MW' },

    { re: /^ES\d[AN]/, cat: '直流保护与汇流', series: '储能柜直流进出线端子（±1500V）', vendors: ['菲尼克斯 Phoenix Contact', '魏德米勒'], note: '接直流母线；须防呆与相序标识' },
    { re: /^FU\d/, cat: '储能系统', series: '储能柜主熔断器（1500VDC）', vendors: ['Bussmann (Eaton)', 'SIBA', '好利 Holi'], note: '按柜最大充放电流与短路耐受配合' },
    { re: /^KMP\d/, cat: '储能系统', series: '储能柜主正接触器（DC 1500V）', vendors: ['宏发 Hongfa', 'TE Connectivity'], note: 'BCU 控制；预充完成后闭合' },
    { re: /^KMR\d/, cat: '储能系统', series: '储能柜预充接触器（小容量 DC）', vendors: ['宏发 Hongfa', 'TE Connectivity'], note: '串预充电阻限制合闸浪涌' },
    { re: /^RR\d/, cat: '储能系统', series: '预充电阻（50Ω 500W 脉冲耐受）', vendors: ['Vishay', '华丰 Huafeng', 'Arcol'], note: '按母线电容量与预充时间核算' },
    { re: /^SH\d/, cat: '计量与监测', series: '分流器（BMS 电流采样）', vendors: ['Isabellenhütte', 'LEM', '南京中旭'], note: '与 BCU 配套检定' },
    { re: /^BCU\d/, cat: '储能系统', series: '储能 BMS 主控（簇级，管理多电池插箱）', vendors: ['宁德时代 CATL', '协能科技 Sinowatt', '高特电子 Gaote'], note: '经交换机与 CMS 以太网通信；支持 OTA' },
    { re: /^B\d\d/, cat: '储能系统', series: '电池插箱（1P100S 磷酸铁锂 118Ah）', vendors: ['宁德时代 CATL', '比亚迪 BYD', '亿纬锂能 EVE'], note: '单柜 4 簇 ×151.5kWh' },
    { re: /^M\d\d/, cat: '储能系统', series: '电池采集单元 BMU（1P100S）', vendors: ['协能科技 Sinowatt', '高特电子 Gaote'], note: 'CAN 上联 BCU' },
    { re: /^LC\d/, cat: '辅助电源与热管理', series: '液冷机组（RS485 联控）', vendors: ['工业冷水机厂家'], note: '与 BCU RS485 联控' },
    { re: /^DH\d/, cat: '辅助电源与热管理', series: '除湿机（AC220V）', vendors: ['工业除湿厂家'], note: '柜内防凝露' },
    { re: /^FR\d/, cat: '储能系统', series: '消防系统（DC24V + 干接点）', vendors: ['消防设备厂家'], note: '探测+灭火；干接点接入告警' },

    { re: /^CMS$/, cat: '二次控制与通信', series: '中央管理系统 CMS（MQTT / OCPP 云接口）', vendors: ['自研控制器'], note: '唯一对外；LAN 接储能 BMS、CAN 接 PMU；支持 OTA' },
    { re: /^SW$/, cat: '二次控制与通信', series: '工业以太网交换机（LAN）', vendors: ['摩莎 Moxa', '华为', '研华 Advantech'], note: '连接 CMS 与储能柜 BMS' },
    { re: /^AT\d/, cat: '二次控制与通信', series: '4G/天线组件（吸盘或胶棒，50Ω）', vendors: ['华为', '中兴', '京信 CommScape'], note: '馈线损耗与安装位置须现场确认' },
    { re: /^PMU\d/, cat: '二次控制与通信', series: '能量管理单元 PMU（功率策略/调度）', vendors: ['自研控制器', '珠海泰坦'], note: 'CAN 下联 DCU/模块/CCU；支持 OTA' },

    { re: /^PE1$/, cat: '母排与接地', series: '保护接地铜排（等电位联结排）', vendors: ['按图加工（铜排 T2 30×4）', 'OBO Bettermann'], note: '所有可触及金属件可靠接地' },
    { re: /^PE2$/, cat: '母排与接地', series: '直流页接地排（页内 PE 汇接）', vendors: ['按图加工', '菲尼克斯'], note: '与 PE1 等电位' },
    { re: /^T\d$/, cat: '辅助电源与热管理', series: '导轨式开关电源（AC220→DC24V）', vendors: ['明纬 MEAN WELL', '西门子 SITOP', '台达 Delta'], note: '控制/主回路分列；安全回路宜独立辅源' },
    { re: /^SB\d/, cat: '二次控制与通信', series: '急停按钮（蘑菇头自锁双断点）', vendors: ['施耐德 Schneider', '和泉 IDEC', '正泰 CHNT'], note: '硬线切除，不得仅走软件' },
    { re: /^SQ\d/, cat: '二次控制与通信', series: '柜门门禁/防拆开关（常闭）', vendors: ['施耐德 Schneider', 'Omron'], note: '开门触发降功率或停机' },
    { re: /^MF\d/, cat: '辅助电源与热管理', series: '热管理风机（轴流 DC24V 带转速反馈）', vendors: ['台达 Delta', 'ebm-papst', '奇宏 AVC'], note: '按柜内热耗核算风量' },

    { re: /^FE\d/, cat: 'AC 进线与保护', series: '进线 EMC 滤波器（X/Y 电容 + 压敏 + GDT 分流式）', vendors: ['Schaffner 萨夫纳', 'TDK', '施耐德 Schneider', '国产通用件'], note: 'EN科技范式：NTC + 共差模 + CX/CY + 压敏 + 3500V GDT；缺 Y 电容判不合格' },
    { re: /^PEC\d/, cat: '功能安全检测', series: 'PE 有效性检测单元（双运放差分精密检测）', vendors: ['自研板卡', 'Bender', '珠海泰坦'], note: 'V-PE-01/02：结果须参与允许充电判据；宜给出阻值量级而非仅有无' },
    { re: /^KF\d/, cat: '功能安全检测', series: '接触器粘连检测单元（阻容分压 + ADC + TVS）', vendors: ['自研板卡', '珠海泰坦', '深圳鸿鹏', '英飞源 Infypower'], note: 'V-ST-01/02：正负极接触器两极均须覆盖；仅辅助触点反馈≠粘连检测' }
  ];

  function classify(dev, family) {
    if (family === 'mwess') {
      for (let i = 0; i < MW_KB.length; i++) if (MW_KB[i].re.test(dev.id)) return MW_KB[i];
      return { cat: '端子与结构件', series: '—', vendors: [], note: '需人工补充分类与选型' };
    }
    for (let i = 0; i < KB.length; i++) if (KB[i].re.test(dev.id)) return KB[i];
    return { cat: '端子与结构件', series: '—', vendors: [], note: '需人工补充分类与选型' };
  }

  /* 关键参数：优先用设计模型算出的 spec，再补端子数与能量域 */
  function keyParams(dev, design) {
    const out = [];
    if (dev.spec) out.push(dev.spec);
    const doms = {};
    dev.sym.pins.forEach(function (p) { if (p.k) doms[p.k] = 1; });
    const dk = Object.keys(doms);
    if (dk.length) out.push('端子 ' + dev.sym.pins.length + ' 个 / 域 ' + dk.join('·'));
    return out.join('；');
  }

  /* ============================================================
   * 原厂文档门户注册表
   * ------------------------------------------------------------
   * 每条 = 厂家官方"下载中心 / 产品选型"入口（原厂域名，非第三方）。
   * 为什么不给 PDF 直链：直链随厂家改版失效，且平台无法联网校验，
   * 编造直链会在工程文档里留下死链。原厂文档中心是可长期有效、
   * 且能查到该品类全部 datasheet 的最短路径。
   * 精确到具体型号的 datasheet，由「AI 补全」按真实型号回填。
   * ============================================================ */
  const PORTAL = {
    'ABB': 'https://library.abb.com/',
    'ABB (OT/OS 系列)': 'https://library.abb.com/',
    'ABB (Tmax)': 'https://library.abb.com/',
    'ABB (AF 系列)': 'https://library.abb.com/',
    '施耐德 Schneider': 'https://www.se.com/cn/zh/download/',
    '施耐德 Schneider (Harmony)': 'https://www.se.com/cn/zh/download/',
    '施耐德 (NSX)': 'https://www.se.com/cn/zh/download/',
    '西门子 Siemens': 'https://support.industry.siemens.com/cs/cn/zh/ps',
    '西门子 Siemens (3VA)': 'https://support.industry.siemens.com/cs/cn/zh/ps',
    '西门子 Siemens (SITOP)': 'https://support.industry.siemens.com/cs/cn/zh/ps',
    '伊顿 Eaton': 'https://www.eaton.com/cn/zh-cn/products.resources.html',
    '正泰 CHNT': 'https://www.chintglobal.com/global/en/service/download/',
    '常熟开关 CSKG': 'https://www.cskg.com/',
    '菲尼克斯 Phoenix Contact': 'https://www.phoenixcontact.com/zh-cn/download',
    '菲尼克斯 Phoenix Contact E-Mobility': 'https://www.phoenixcontact.com/zh-cn/download',
    'Phoenix Contact E-Mobility': 'https://www.phoenixcontact.com/zh-cn/download',
    '魏德米勒 Weidmüller': 'https://www.weidmueller.com.cn/cn/downloads/',
    '威腾 Wonke': 'https://www.wonke.com/',
    'OBO Bettermann': 'https://www.obo.com.cn/downloads',
    'DEHN': 'https://www.dehn.cn/zh/downloads',
    '雷迅 LSP': 'https://www.lsp.com.cn/',
    'Schaffner': 'https://www.schaffner.com/products/downloads/',
    'TDK-EPCOS': 'https://product.tdk.com/zh/search/emc',
    '赛纪 SJ': 'https://www.sjdz.com.cn/',
    'Bourns (GDT)': 'https://www.bourns.com/products/circuit-protection',
    'Bender': 'https://www.bender.de/en/downloads',
    'Bender (isoEV)': 'https://www.bender.de/en/downloads',
    '珠海泰坦': 'https://www.titans.com.cn/',
    '深圳鸿鹏': 'https://www.szhongpeng.com/',
    '西安爱科': 'https://www.aikeenergy.com/',
    '威胜 Wasion': 'https://www.wasion.com/',
    '林洋 Linyang': 'https://www.linyang.com/',
    '江苏智臻': 'https://www.jszzny.com/',
    '华立 Holley': 'https://www.holleytech.cn/',
    '科陆 Clou': 'https://www.clou-global.com/',
    'LEM': 'https://www.lem.com/en/productfinder',
    'Honeywell': 'https://sps.honeywell.com/us/en/products/sensing-and-iot',
    '森社 Sensor': 'https://www.sensor-china.com/',
    '南京中旭': 'https://www.zxele.com/',
    '英飞源 Infypower': 'https://www.infypower.com/download.html',
    '优优绿能 UUGreen': 'https://www.uugreenpower.com/',
    '通合科技 Tonhe': 'https://www.tonhe.com.cn/',
    '华为数字能源': 'https://digitalpower.huawei.com/cn/download.html',
    '永联 Winline': 'https://www.winline.com/',
    '盛弘 Sinexcel': 'https://www.sinexcel.com/download/',
    '科华数据 Kehua': 'https://www.kehua.com/',
    '上能电气 Sineng': 'https://www.sineng.com.cn/',
    '明纬 MEAN WELL': 'https://www.meanwell.com/webapp/product/search.aspx',
    '台达 Delta': 'https://www.deltaww.com/zh-CN/download',
    'ebm-papst': 'https://www.ebmpapst.com.cn/zh/products.html',
    '三协 Sanyo Denki': 'https://www.sanyodenki.com/',
    '奇宏 AVC': 'https://www.avc.co/',
    'Bussmann (Eaton)': 'https://www.eaton.com/cn/zh-cn/products/electrical-circuit-protection/fuses.resources.html',
    'Littelfuse': 'https://www.littelfuse.com/products',
    'SIBA': 'https://www.siba-fuses.com/en/downloads/',
    '好利 Holi': 'https://www.holifuse.com/',
    '宏发 Hongfa': 'https://www.hongfa.com/pro',
    'TE Connectivity': 'https://www.te.com.cn/zhs/products.html',
    '比亚迪弗迪': 'https://www.byd.com/cn/',
    '比亚迪弗迪 FinDreams': 'https://www.byd.com/cn/',
    '汇之华 Huizhihua': 'https://www.hzh-relay.com/',
    '汇之华': 'https://www.hzh-relay.com/',
    'Vishay': 'https://www.vishay.com/en/resistors/',
    '华丰 Huafeng': 'https://www.hfresistor.com/',
    'Arcol': 'https://www.arcolresistors.com/downloads/',
    '天兴 Tianxing': 'https://www.txresistor.com/',
    '永贵电器 Yonggui': 'https://www.yonggui.com.cn/',
    '中航光电 AVIC': 'https://www.china-aviation.com/',
    '巴斯巴 BSBattery': 'https://www.busbar-tech.com/',
    '瑞可达 Recodeal': 'https://www.recodeal.com/',
    'REMA': 'https://www.rema.eu/en/downloads/',
    '宁德时代 CATL': 'https://www.catl.com/en/',
    '比亚迪 BYD': 'https://www.byd.com/cn/',
    '亿纬锂能 EVE': 'https://www.evebattery.com/',
    '瑞浦兰钧 REPT': 'https://www.rept-battero.com/',
    '海辰储能 HiTHIUM': 'https://www.hithium.com/',
    '协能科技 Sinowatt': 'https://www.sinowatt.com.cn/',
    '高特电子 Gaote': 'https://www.gaotecn.com/',
    '力高新能源': 'https://www.ligoo.cn/',
    '有人物联 USR': 'https://www.usr.cn/Download/',
    '映翰通 InHand': 'https://www.inhandnetworks.cn/support/download.html',
    '研华 Advantech': 'https://www.advantech.com/zh-cn/support',
    '华为': 'https://support.huawei.com/enterprise/',
    '威纶通 Weinview': 'https://www.weinview.cn/download.aspx',
    '昆仑通态 MCGS': 'https://www.mcgs.com.cn/',
    '深圳捷易': 'https://www.jieyi-tech.com/',
    '和泉 IDEC': 'https://cn.idec.com/',
    'Omron': 'https://www.fa.omron.com.cn/products/',
    'Vector': 'https://www.vector.com/cn/zh/products/'
  };

  /* 三级手册链接策略：
     ① 原厂文档中心（确知的稳定官方入口）
     ② AI 补全的具体型号 datasheet（enrichBOM 回填，标注置信度）
     ③ 自研件/按图加工件：无原厂手册，标注为内部文档 */
  var DOC_STORE = 'evse.bom.docOverrides.v1';
  var DOC_OVERRIDES = {};
  try {
    if (typeof localStorage !== 'undefined') DOC_OVERRIDES = JSON.parse(localStorage.getItem(DOC_STORE) || '{}') || {};
  } catch (e) { DOC_OVERRIDES = {}; }
  function docKey(row) { return String((row && row.cat) || '') + '|' + String((row && row.name) || ''); }
  function validHttpUrl(u) {
    try {
      var x = new URL(String(u || '').trim());
      return /^https?:$/.test(x.protocol) ? x.href : '';
    } catch (e) { return ''; }
  }
  function getDocOverride(row) {
    var o = DOC_OVERRIDES[docKey(row)];
    return o && validHttpUrl(o.url) ? o : null;
  }
  function setDocOverrides(map) {
    if (!map || typeof map !== 'object') return 0;
    var n = 0;
    Object.keys(map).forEach(function (k) {
      var v = map[k] || {};
      var url = validHttpUrl(v.url);
      if (!url) return;
      DOC_OVERRIDES[k] = { url: url, title: String(v.title || ''), vendor: String(v.vendor || ''), note: String(v.note || ''), conf: String(v.conf || 'low'), at: new Date().toISOString() };
      n++;
    });
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(DOC_STORE, JSON.stringify(DOC_OVERRIDES)); } catch (e) {}
    return n;
  }
  function clearDocOverrides() {
    DOC_OVERRIDES = {};
    try { if (typeof localStorage !== 'undefined') localStorage.removeItem(DOC_STORE); } catch (e) {}
  }
  function docLink(row) {
    var ov = getDocOverride(row);
    if (ov) return { url: ov.url, kind: 'ai', vendor: ov.vendor || 'AI 推荐', hint: ov.note || '' };
    /* V8-MANUAL: 手册数据库优先——2026-09-26 逐链联网核验，失效链接已替换/标注 */
    const kb = window.EVSE_MANUAL_KB;
    if (kb && kb.pick) {
      const hit = kb.pick(row);
      if (hit) {
        if (hit.status === 'nohref') return { url: '', kind: 'nohref', vendor: hit.vendor, hint: hit.hint || hit.note || '' };
        if (hit.status === 'ok' || hit.status === 'warn') return { url: hit.url, kind: hit.status === 'ok' ? 'oem' : 'warn', vendor: hit.vendor, hint: hit.note || '' };
      }
    }
    const vs = row.vendors || [];
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (/自研|按图加工|土建/.test(v)) continue;
      if (PORTAL[v]) return { url: PORTAL[v], kind: 'oem', vendor: v };
    }
    if (vs.length && /自研|按图加工|土建/.test(vs[0])) {
      return { url: '', kind: 'internal', vendor: vs[0] };
    }
    return { url: '', kind: 'none', vendor: '' };
  }

  /* 主入口：设计模型 → BOM 行 */
  function build(design) {
    const groups = {};
    design.devices.forEach(function (d) {
      if (d.sym.isXref || d.pwr) return;   /* 跳过跨页符与电源旗标伪器件 */
      const k = classify(d, design.params && design.params.family);
      const params = keyParams(d, design);
      /* 同名同参数的合并计数（如 4 个充电模块、2 把枪） */
      const key = k.cat + '|' + d.name + '|' + params;
      if (!groups[key]) {
        groups[key] = {
          cat: k.cat, name: d.name, model: k.series, vendors: k.vendors.slice(),
          params: params, qty: 0, note: k.note, tags: [], ai: null
        };
      }
      groups[key].qty++;
      groups[key].tags.push(d.tag);
    });
    const rows = Object.keys(groups).map(function (k) { return groups[k]; });
    rows.forEach(function (r) {
      const d = docLink(r);
      r.doc = d.url; r.docKind = d.kind; r.docVendor = d.vendor;
    });
    rows.sort(function (a, b) {
      const ia = CATS.indexOf(a.cat), ib = CATS.indexOf(b.cat);
      if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.name.localeCompare(b.name, 'zh');
    });
    return { version: VERSION, rows: rows, cats: CATS, generated: new Date().toISOString() };
  }

  const COLS = ['类别', '设备名称', '型号参考', '推荐厂家', '关键参数', '数量', '说明', '手册下载链接'];

  /* 手册列的展示文本（图纸与面板共用） */
  function hostShort(u) {
    try { return new URL(String(u)).hostname.replace(/^www\./i, ''); } catch (e) { return ''; }
  }
  function docLabel(r) {
    if (r.ai && r.ai.doc) return { text: r.ai.docTitle ? String(r.ai.docTitle).slice(0, 28) : ('AI 推荐 · ' + hostShort(r.ai.doc)), url: r.ai.doc, ai: true, hint: r.ai.docReason || '' };
    if (r.docKind === 'ai' && r.doc) return { text: 'AI 推荐 · ' + hostShort(r.doc) + ' · 核验', url: r.doc, ai: true, hint: r.hint || '' };
    /* V8-MANUAL: 手册库状态化展示 */
    if (r.docKind === 'nohref') return { text: '◎ 无公开手册：' + (r.docVendor || '该厂家'), url: '', hint: r.hint || '', nohref: true };
    if (r.docKind === 'warn') return { text: '⚠ ' + hostShort(r.doc) + ' 手册（待复核）', url: r.doc, warn: true, hint: r.hint || '' };
    if (r.doc && /^https?:\/\//.test(r.doc) && r.manuals && r.manuals.length) return { text: '📄 ' + (r.manuals[0].vendor || '厂家') + ' 手册', url: r.doc, ai: false, alt: r.manuals };
    if (r.doc && /^https?:\/\//.test(r.doc)) return { text: '📄 ' + (hostShort(r.doc) || '原厂') + ' 手册', url: r.doc, ai: false };
    if (r.docKind === 'oem') return { text: r.docVendor + ' 文档中心', url: r.doc, ai: false };
    if (r.docKind === 'internal') return { text: '内部文档（自研/按图加工）', url: '', ai: false };
    return { text: '待补充原厂文档', url: '', ai: false };
  }

  function toCSV(bom, design) {
    const q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    const head = '\ufeff' + COLS.concat(['手册来源', '位号']).map(q).join(',') + '\n';
    const body = bom.rows.map(function (r) {
      const dl = docLabel(r);
      return [r.cat, r.name, (r.ai && r.ai.model) || r.model, (r.ai && r.ai.vendor) || r.vendors.join(' / '),
        r.params + (r.ai && r.ai.params ? '；' + r.ai.params : ''), r.qty,
        (r.ai && r.ai.note) || r.note, dl.url,
        dl.ai ? 'AI 推荐·置信度 ' + ((r.ai && r.ai.conf) || '?') + '·需核验' : (r.docKind === 'oem' ? '原厂文档中心' : r.docKind === 'internal' ? '内部文档' : '待补充'),
        r.tags.join(' ')].map(q).join(',');
    }).join('\n');
    const foot = '\n' + q('注：数量·关键参数·位号由引脚级网表计算得出；型号参考仅到系列级，推荐厂家为常见候选非背书；手册链接为原厂文档中心入口，具体型号 datasheet 需在其中按型号检索；全部条目 RFQ_REQUIRED，须经电气专业复核。') + '\n';
    return head + body + foot;
  }

  return { VERSION, CATS, COLS, KB, PORTAL, build, toCSV, classify, docLink, docLabel, setDocOverrides, clearDocOverrides, getDocOverride, docKey };
})();
