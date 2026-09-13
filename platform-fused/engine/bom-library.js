/* bom-library.js —— 器件参考知识库（融合 Qwen3.8 的人工整理数据）
 * ---------------------------------------------------------------------------
 * 来源与边界（重要）：
 *   数据来自 Qwen3.8 `engine/bom-library.js` 的 43 条人工整理条目，
 *   由本平台重新结构化：
 *     · 位号正则 `re` → 按 device kind 精确绑定（不靠名字猜，避免同 kind 多实例串型号）
 *     · `price` 字段**整体删除** —— 本平台禁止给出价格承诺（见 api/engineering.js）
 *     · `url` 改名 `referenceUrl` 并强制通过 https + 公网校验
 *     · `manual` 改名 `manualLabel`（仅为链接文案，不代表已验证的型号级手册）
 *
 *   本模块只提供 **参考知识（reference knowledge）**：它可以出现在“参考型号 /
 *   推荐厂家 / 说明 / 资料入口”这些**内容列**上，但**永远不能**点亮
 *   “型号 / 参考推荐厂家 / 说明手册下载”这些**信任列** —— 那三列只接受经过
 *   CANDIDATE → HMAC-SHA256 → APPROVED 的受控选型
 *   （见 engineering-bom.js 的 approvedSelectionValid()）。
 *
 *   链接诚实性：绝大多数条目指向**厂商官网/产品页首页**，不是型号级 datasheet。
 *   因此 linkKind 显式标注为 'vendor-home' 或 'search'，只有确为型号级文档的
 *   条目才允许标 'datasheet'。禁止把首页伪装成手册直链。
 */
(function () {
  'use strict';

  const VERSION = '1.0.0';
  const SCHEMA = 'evse-bom-knowledge/1.0';
  const SOURCE_NOTE = 'Qwen3.8 人工整理（用户既有 AI BOM 清单 + 器件实例库），经本平台按 device kind 重新绑定';

  /* linkKind 取值：
   *   'datasheet'   型号级数据手册/选型指南直链（可标“手册”）
   *   'vendor-home' 厂商官网或产品页首页（只能标“产品页”，不得称“手册”）
   *   'search'      搜索引擎结果入口（只能标“检索入口”）
   */
  const CATALOG_STATUS = 'REFERENCE_KNOWLEDGE—REQUIRES_RFQ_AND_CONTROLLED_APPROVAL';

  /* 每条：kinds[] 精确绑定 device kind；tagHint 仅作展示提示，不参与匹配 */
  const ENTRIES = [
    { kinds: ['ac-isolator'], tagHint: 'QS1', category: '配电保护', deviceName: '进线隔离开关',
      modelHint: 'Emax2 / MTZ 隔离型', vendorHints: 'ABB / 施耐德 / 正泰', paramHint: '按进线档位，4P',
      qtyHint: '1', note: '箱变低压侧总隔离', manualLabel: '产品页',
      referenceUrl: 'https://new.abb.com', linkKind: 'vendor-home' },
    { kinds: ['ac-breaker'], tagHint: 'QF1', category: '配电保护', deviceName: '主进线断路器（MCCB）',
      modelHint: 'NSX / TMax', vendorHints: '施耐德 / ABB / 德力西', paramHint: '按进线档位，3P/4P，分断按档位',
      qtyHint: '1', note: '进线总保护·MX 辅助触点', manualLabel: '选型指南',
      referenceUrl: 'https://www.schneider-electric.com', linkKind: 'vendor-home' },
    { kinds: ['surge-protector'], tagHint: 'FV1', category: '配电保护', deviceName: '浪涌保护器（SPD）',
      modelHint: 'DEHNshield 3P+N', vendorHints: 'DEHN / 菲尼克斯 / 欧姆龙', paramHint: 'Type2+Type3，40kA',
      qtyHint: '1', note: 'AC 侧防雷保护', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.dehn.cn', linkKind: 'vendor-home' },
    { kinds: ['residual-current-monitor'], tagHint: 'RCM1', category: '配电保护', deviceName: '剩余电流监测',
      modelHint: 'RCM420 / AC+DC 6mA TypeB', vendorHints: 'Bender / 安科瑞 / 国产定制', paramHint: 'AC+DC 6mA',
      qtyHint: '1', note: '漏电监测', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.bender-cn.com', linkKind: 'vendor-home' },
    { kinds: ['ac-meter'], tagHint: 'PJ1', category: '通信计量', deviceName: '交流电能表',
      modelHint: 'APM810 / DTSD341', vendorHints: '安科瑞 / 威胜 / 林洋', paramHint: '3×220/380V，0.5 级',
      qtyHint: '1', note: '交流侧总计量', manualLabel: '下载中心',
      referenceUrl: 'https://www.acrel.cn', linkKind: 'vendor-home' },
    { kinds: ['dc-meter'], tagHint: 'PJ2', category: '通信计量', deviceName: '直流电能表',
      modelHint: 'DJSF1352-DC', vendorHints: '安科瑞 / 林洋 / 许继', paramHint: '1000VDC，0.5 级',
      qtyHint: '每枪 1', note: '直流侧计量计费', manualLabel: '产品页',
      referenceUrl: 'https://www.acrel.cn', linkKind: 'vendor-home' },
    { kinds: ['ac-contactor'], tagHint: 'KM1', category: '配电保护', deviceName: '交流主接触器',
      modelHint: 'LC1D 系列', vendorHints: '施耐德 / ABB / 良信', paramHint: 'AC-3 按档位，线圈 24VDC',
      qtyHint: '1', note: '交流主回路通断', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.schneider-electric.com', linkKind: 'vendor-home' },
    { kinds: ['ac-busbar', 'dc-busbar', 'aux-busbar', 'ess-busbar'], tagHint: 'WB', category: '土建辅材', deviceName: '铜母排 / 配电柜体',
      modelHint: 'GGD / GCS 柜内铜排', vendorHints: '正泰 / 德力西 / 良信', paramHint: '按电流档，镀锡铜，IP31–IP54',
      qtyHint: '按方案', note: '分配母排与柜体', manualLabel: '—',
      referenceUrl: 'https://www.chint.com', linkKind: 'vendor-home' },
    { kinds: ['power-module-array'], tagHint: 'M1', category: '功率变换', deviceName: 'AC/DC PFC 整流模块',
      modelHint: 'HCP-40K-SiC', vendorHints: '优优绿能 / 英飞源 / 通合', paramHint: '40kW，380Vac→DC 700–1000V',
      qtyHint: '按功率配', note: 'SiC 高频 PFC，功率因数 ≥0.99', manualLabel: '产品页',
      referenceUrl: 'https://www.uugreen.com', linkKind: 'vendor-home' },
    { kinds: ['dc-fuse', 'ess-fuse'], tagHint: 'FU', category: '配电保护', deviceName: '直流高压熔断器',
      modelHint: 'HOLLYFUSE 新能源高压直流快熔（1000/1500VDC 档按系统电压选）',
      vendorHints: '好利来 HOLLYFUSE（首选）/ Bussmann(伊顿) / Mersen',
      paramHint: '按档位，电压档 ≥ 系统电压，aR/gPV 级，I²t 与接触器配合',
      qtyHint: '每枪 1', note: '输出回路过流保护', manualLabel: '官网产品页',
      referenceUrl: 'https://www.hollyfuse.com/', linkKind: 'vendor-home' },
    { kinds: ['current-transducer'], tagHint: 'TA1', category: '通信计量', deviceName: '直流电流传感器',
      modelHint: 'HX 系列霍尔传感器', vendorHints: 'LEM / 青智 / 成都科舰', paramHint: '0 – 按档位 A',
      qtyHint: '1', note: '直流电流测量', manualLabel: '产品页',
      referenceUrl: 'https://www.lem.com', linkKind: 'vendor-home' },
    { kinds: ['insulation-monitor'], tagHint: 'RI1', category: '充电控制', deviceName: '绝缘监测装置（IMD）',
      modelHint: 'ISOMETER IRDH', vendorHints: 'Bender / 国产定制', paramHint: 'DC 0–1000V，报警',
      qtyHint: '1', note: 'DC 侧对地绝缘监测', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.bender-cn.com', linkKind: 'vendor-home' },
    { kinds: ['discharge-resistor', 'precharge-resistor'], tagHint: 'RS', category: '功率变换', deviceName: '泄放 / 预充电阻',
      modelHint: '定制铝壳电阻', vendorHints: '国内标准件 / 上海雷卯', paramHint: '阻值待核算',
      qtyHint: '按方案', note: '停机泄放 / 簇预充', manualLabel: '检索入口',
      referenceUrl: 'https://www.baidu.com/s?wd=%E9%93%9D%E5%A3%B3%E6%B3%84%E6%94%BE%E7%94%B5%E9%98%BB', linkKind: 'search' },
    { kinds: ['dc-contactor', 'ess-contactor', 'precharge-contactor'], tagHint: 'K2…', category: '配电保护', deviceName: '直流接触器',
      modelHint: 'EVS / GV 系列', vendorHints: 'ABB / 施耐德 / EVCO / 宏发', paramHint: '按档位 / 1000VDC',
      qtyHint: '每枪 2', note: '充电回路通断控制（正/负）', manualLabel: '—',
      referenceUrl: 'https://www.hongfa.com', linkKind: 'vendor-home' },
    { kinds: ['charge-connector', 'ac-charge-connector'], tagHint: 'XS', category: '枪线连接', deviceName: '充电枪 / 充电连接器',
      modelHint: 'CCS2 / GB/T 250–500A 液冷', vendorHints: '菲尼克斯 / 永贵 / 中航光电',
      paramHint: '按枪电流档，液冷枪线，温升闭环', qtyHint: '按枪数', note: '充电连接器（支持液冷）',
      manualLabel: '产品页', referenceUrl: 'https://www.yonggui.com', linkKind: 'vendor-home' },
    { kinds: ['charge-controller'], tagHint: 'A1', category: '充电控制', deviceName: '充电主控板（充电控制单元）',
      modelHint: 'TMS320F2838x / STM32H7', vendorHints: 'TI / ST / 国产替代', paramHint: '功率分配，泵阀 PID，故障联锁',
      qtyHint: '1', note: '站级主控 / CCU 全局调度', manualLabel: '产品页',
      referenceUrl: 'https://www.ti.com', linkKind: 'vendor-home' },
    { kinds: ['comm-gateway'], tagHint: 'A2/A3', category: '通信计量', deviceName: '通信网关 / 工业路由器',
      modelHint: 'TR321 / TR341；IEC 61851 / OCPP 2.0.1', vendorHints: '移远 / 华为 / 研华 / Vector',
      paramHint: 'PLC+CP 信号；4G LTE，OPC/MQTT', qtyHint: '1', note: '桩端通信与 OCPP 上传云平台',
      manualLabel: '产品页', referenceUrl: 'https://www.quectel.com.cn', linkKind: 'vendor-home' },
    { kinds: ['hmi-unit', 'touch-display'], tagHint: 'A4', category: '充电控制', deviceName: '人机交互屏',
      modelHint: '串口屏 DGUS 系', vendorHints: '迪文 / 淘晶驰', paramHint: '7–10 寸，UART',
      qtyHint: '1', note: '人机交互', manualLabel: '产品页',
      referenceUrl: 'https://www.dwin.com.cn', linkKind: 'vendor-home' },
    { kinds: ['bms-controller'], tagHint: 'A5', category: '电池储能', deviceName: 'BMS 电池管理系统',
      modelHint: '从控 + 主控架构', vendorHints: '科工电子 / 高特 / 协能', paramHint: 'SOC/SOH/均衡/热管理',
      qtyHint: '1 套', note: '电池组监控保护', manualLabel: '检索入口',
      referenceUrl: 'https://www.baidu.com/s?wd=BMS%E7%94%B5%E6%B1%A0%E7%AE%A1%E7%90%86%E7%B3%BB%E7%BB%9F', linkKind: 'search' },
    { kinds: ['ess-pcs', 'ess-dcdc', 'dc-dc-charge-module'], tagHint: 'M3/M4', category: '电池储能', deviceName: 'PCS 储能变流器 / 双向 DC/DC',
      modelHint: '50–100kW 组串式 / 双向 DCDC', vendorHints: '阳光电源 / 科华 / 上能 / 英飞源',
      paramHint: 'DC↔AC，充放电双向', qtyHint: '按容量', note: '储能充放电控制 / 耦合',
      manualLabel: '产品页', referenceUrl: 'https://www.sungrowpower.com', linkKind: 'vendor-home' },
    { kinds: ['aux-psu', 'hv-aux-converter', 'aux-dc-converter', 'interface-12v-supply'], tagHint: 'T1/T2', category: '充电控制', deviceName: '辅助开关电源',
      modelHint: 'DR / LM 系列导轨电源', vendorHints: '金升阳 / 明纬 / 楚帆', paramHint: '24V/12V，按负载',
      qtyHint: '各 1', note: '二次设备供电', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.mornsun.cn', linkKind: 'vendor-home' },
    { kinds: ['thermal-unit'], tagHint: 'M2', category: '液冷散热', deviceName: '液冷源 CDU / 风机',
      modelHint: 'CRP-25/32/50', vendorHints: '格兰富 / 盾安 / ebm-papst', paramHint: '25–50kW 换热，12–24L/min',
      qtyHint: '1', note: '循环冷却液，温控 ±2℃', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.grundfos.cn', linkKind: 'vendor-home' },
    { kinds: ['control-relay'], tagHint: 'KA1', category: '充电控制', deviceName: '控制继电器',
      modelHint: 'MY4N / HF115F', vendorHints: '欧姆龙 / 宏发', paramHint: '24VDC 线圈',
      qtyHint: '1', note: '风机驱动·急停串入', manualLabel: '产品页',
      referenceUrl: 'https://www.omron.com.cn', linkKind: 'vendor-home' },
    { kinds: ['safety-device', 'four-pole-safety', 'selector-switch-dual', 'ac-dc-mode-interlock'], tagHint: 'SB1/SQ1', category: '充电控制', deviceName: '急停按钮 / 门禁开关 / 安全联锁',
      modelHint: 'XB2 / XA2 / XCK-M', vendorHints: '施耐德 / 和泉 / 正泰 / 欧姆龙',
      paramHint: '双断点自锁 / 慢动断触', qtyHint: '各 1', note: '硬线切除输出使能 / 开门联锁',
      manualLabel: '产品页', referenceUrl: 'https://www.schneider-electric.com', linkKind: 'vendor-home' },
    { kinds: ['indicator-lamp'], tagHint: 'HL', category: '充电控制', deviceName: '状态指示灯',
      modelHint: 'AD16', vendorHints: '正泰 / 德力西', paramHint: '红/绿/黄三色',
      qtyHint: '1 套', note: '柜门状态指示', manualLabel: '—',
      referenceUrl: 'https://www.chint.com', linkKind: 'vendor-home' },
    { kinds: ['environment-sensor'], tagHint: 'B1', category: '消防安防', deviceName: '烟感 / 温感探测器',
      modelHint: 'JTY-GD / DISS451', vendorHints: '海湾 / 青鸟 / 利达', paramHint: '烟温复合探测',
      qtyHint: '按面积', note: '环境 / 火灾探测', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.gstxf.com', linkKind: 'vendor-home' },
    { kinds: ['battery-heater'], tagHint: 'EH', category: '土建辅材', deviceName: '加热 / 除湿装置',
      modelHint: 'DR 加热器', vendorHints: '国内标准件', paramHint: '按舱体功率',
      qtyHint: '按方案', note: '低温 / 凝露控制', manualLabel: '检索入口',
      referenceUrl: 'https://www.baidu.com/s?wd=%E6%9F%9C%E5%86%85%E5%8A%A0%E7%83%AD%E9%99%A4%E6%B9%BF%E5%99%A8', linkKind: 'search' },
    { kinds: ['rf-antenna', 'loudspeaker', 'voice-board', 'card-reader'], tagHint: 'GPS/RF', category: '通信计量', deviceName: '定位 / 语音 / 刷卡外设',
      modelHint: 'NEO 系定位模组 / DGUS 读卡', vendorHints: 'u-blox / 移远 / 迪文',
      paramHint: '定位轨迹 / UART / 刷卡', qtyHint: '各 1', note: '站点定位与交互外设',
      manualLabel: '产品页', referenceUrl: 'https://www.u-blox.com', linkKind: 'vendor-home' },
    { kinds: ['output-precheck-monitor', 'contactor-state-monitor', 'control-pilot-generator', 'control-pilot-monitor', 'vehicle-diode-detector'], tagHint: 'SC1/AD1', category: '充电控制', deviceName: '预检 / 粘连 / CP 诊断单元',
      modelHint: 'AZ733W + OR-1009 拓扑；HF3FA-W + OR-1009 拓扑',
      vendorHints: '宏发 / Vishay / Panasonic', paramHint: '双继电器触点 + 限流 + 隔离光耦；1M×2 分压',
      qtyHint: '每枪 1', note: '合闸前检测 / 未合闸时粘连检测', manualLabel: '产品页',
      referenceUrl: 'https://www.hongfa.com', linkKind: 'vendor-home' },
    { kinds: ['battery-cluster', 'battery-box'], tagHint: 'GB', category: '电池储能', deviceName: '磷酸铁锂电池簇',
      modelHint: '280Ah / 314Ah 方形', vendorHints: '宁德时代 / 比亚迪 / 亿纬', paramHint: '3.2V，循环 6000+',
      qtyHint: '按容量', note: '储能削峰 / 光储充一体', manualLabel: 'PDF 手册',
      referenceUrl: 'https://www.catl.com', linkKind: 'vendor-home' },
    { kinds: ['connector-lock'], tagHint: 'YV', category: '枪线连接', deviceName: '电子锁',
      modelHint: 'YV 系电子锁', vendorHints: '宏发 / 飞虹 / 国创', paramHint: '12/24V，锁反馈',
      qtyHint: '每枪 1', note: '充电枪电子锁', manualLabel: '—',
      referenceUrl: 'https://www.hongfa.com', linkKind: 'vendor-home' },
    { kinds: ['earth-bar'], tagHint: 'PE', category: '土建辅材', deviceName: '接地系统',
      modelHint: '镀锌扁钢 / 铜排', vendorHints: '国内标准件', paramHint: '接地电阻 ≤4Ω',
      qtyHint: '1 套', note: '防雷接地 + 保护接地', manualLabel: '检索入口',
      referenceUrl: 'https://www.baidu.com/s?wd=%E6%8E%A5%E5%9C%B0%E9%93%9C%E6%8E%92', linkKind: 'search' },
    { kinds: ['ac-incomer', 'split-interface', 'nacs-shared-inlet', 'external-connector-12pin', 'heating-connector-2pin', 'dc-charge-inlet'], tagHint: 'W01/XG', category: '土建辅材', deviceName: '电力电缆 / 接口',
      modelHint: 'YJV / YJV22', vendorHints: '远东 / 宝胜 / 中天', paramHint: '3×240+1×120mm²（按截面），0.6/1kV',
      qtyHint: '按距离', note: '进线电力电缆与接口', manualLabel: '—',
      referenceUrl: 'https://www.fegroup.cn', linkKind: 'vendor-home' },
    { kinds: ['temperature-sensor'], tagHint: 'TEMP', category: '监测', deviceName: '两线温度传感器',
      modelHint: 'PT100 / NTC', vendorHints: '国内标准件', paramHint: '枪端 / 母排测温',
      qtyHint: '按点', note: '枪端与母排温度监测', manualLabel: '检索入口',
      referenceUrl: 'https://www.baidu.com/s?wd=PT100%E6%B8%A9%E5%BA%A6%E4%BC%A0%E6%84%9F%E5%99%A8', linkKind: 'search' },
    { kinds: ['ac-ev-transformer'], tagHint: 'TR', category: '功率变换', deviceName: '交流充电支路隔离变压器',
      modelHint: '干式隔离变压器', vendorHints: '国内标准件', paramHint: '按支路容量',
      qtyHint: '1', note: '交流充电支路隔离', manualLabel: '检索入口',
      referenceUrl: 'https://www.baidu.com/s?wd=%E5%B9%B2%E5%BC%8F%E9%9A%94%E7%A6%BB%E5%8F%98%E5%8E%8B%E5%99%A8', linkKind: 'search' },
    { kinds: ['ac-dc-power-selector'], tagHint: 'SEL', category: '配电保护', deviceName: '交直流双极模式选择边界',
      modelHint: '双极机械选择开关', vendorHints: '施耐德 / 正泰', paramHint: '默认断开，硬互锁',
      qtyHint: '1', note: 'AC/DC 模式硬互锁边界', manualLabel: '—',
      referenceUrl: 'https://www.schneider-electric.com', linkKind: 'vendor-home' }
  ];

  /* 建立 kind → entry 反查表 */
  const BY_KIND = Object.create(null);
  ENTRIES.forEach((entry, index) => {
    entry.kinds.forEach((kind) => {
      if (BY_KIND[kind]) {
        /* 一个 kind 只允许绑定一条知识，冲突必须显式暴露而不是静默覆盖 */
        BY_KIND[kind].conflicts = (BY_KIND[kind].conflicts || []).concat([index]);
        return;
      }
      BY_KIND[kind] = entry;
    });
  });

  function knownKinds() {
    return Object.keys(BY_KIND).sort();
  }

  function entryForKind(kind) {
    return BY_KIND[String(kind || '')] || null;
  }

  /* 供 BOM / 询价清单使用的扁平视图。price 永不出现。 */
  function referenceFor(kind, deviceKinds) {
    const entry = entryForKind(kind);
    const base = {
      schema: SCHEMA,
      source: SOURCE_NOTE,
      catalogStatus: CATALOG_STATUS,
      kind: String(kind || ''),
      known: !!entry
    };
    if (!entry) {
      return Object.assign(base, {
        category: '待补录', deviceName: '', modelHint: '未录入参考库',
        vendorHints: '', paramHint: '', qtyHint: '', note: '库内无该器件类别的参考条目，须经 RFQ 或人工补录',
        manualLabel: '—', referenceUrl: '', linkKind: 'none',
        inquiryEntry: '厂家样本 / 规格书', verifyItems: '额定值、认证、环境条件、项目适用性'
      });
    }
    return Object.assign(base, {
      category: entry.category,
      deviceName: entry.deviceName,
      tagHint: entry.tagHint,
      modelHint: entry.modelHint,
      vendorHints: entry.vendorHints,
      paramHint: entry.paramHint,
      qtyHint: entry.qtyHint,
      note: entry.note,
      manualLabel: entry.manualLabel,
      referenceUrl: entry.referenceUrl,
      linkKind: entry.linkKind
    });
  }

  const api = {
    VERSION, SCHEMA, CATALOG_STATUS, SOURCE_NOTE,
    ENTRIES, knownKinds, entryForKind, referenceFor
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.EVSE_BOM_KNOWLEDGE = api;
})();
