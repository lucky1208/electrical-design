# 源数据驱动的充电储能系统电气设计生成、可信校核与全寿命优化平台

从标准原文、器件手册、现场实测与运行数据出发，输出可追溯、可验证、可审查的电气方案。自托管部署包，**纯静态、零依赖、零构建、可离线运行**：没有 npm、没有打包器、没有 CDN、没有后端。

> **边界声明**：输出为**方案级概念草图**（`CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED`），
> 不是生产图 / 施工图 / 报价单 / 保护整定书 / 合规证明。所有器件档位标注为 `RFQ_REQUIRED`，
> 须经电气专业人员复核后方可用于工程。

---

## 一、文件清单（V2 工程校核试点 · 2026-10）

| 文件 | 作用 | 行数级 |
|---|---|---|
| `index.html` | 平台界面 + 全部交互逻辑（原生 JS，无框架）：Word 式 ribbon 标签栏、新建图纸对话框、工程存取、通电仿真集成、自定义元器件编辑器 | ~2100 |
| `evse-core.js` | **符号库 + 引脚级网表生成器**：35+ 个 IEC 60617 / GB/T 4728 画法符号，pin→pin 网表构造；开关符号带 `isSwitch:true` 供仿真识别 | ~2400 |
| `evse-mwess-core.js` | **兆瓦储能·极充系统**：储能/DC·DC/枪/BMS 专用符号与引脚级拓扑；当前导出 7 页（交流、DC/DC/母线、双枪、双储能柜、控制通信、独立功率矩阵）。架构基线为 6×AC/DC + 24×DC/DC + 2 枪 + 2 柜；仅 AC/DC 数量和两类模块功率可调。电气连接、器件本体避让、图框与 BOM 分离检查通过（7/7 页）；平行线净距仍有 20 对告警、器件净空和文字避让仍有少量告警，详见 `MWESS_DESIGN.md` 与 `out_mwess/mwess-audit.json` | ~800 |
| `evse-geo.js` | **布局 / 布线 / 规则引擎**：正交布线、半圆跨越、分轮通道推挤、器件与标注净空修复、DRC + 七维评分；`generate()` 按 `params.family` 分支 | ~3300 |
| `evse-labelfix.js` | **标注自动避让**：12 候选位 + 网格代价函数，动文字不动线 | ~88 |
| `evse-render.js` | 基元 → 分层可命中 SVG（图框 / 走线 / 器件 / 选中）；标题栏支持 `params.tb` 自定义字段（图号/版本/编制/校核/批准/状态） | ~330 |
| `evse-sim.js` | **通电仿真引擎（V13 新增）**：并查集 + BFS 带电传播，开关分合闸 → 全网带电/失电判定 + 流向计算 | ~130 |
| `evse-manual-kb.js` | 手册下载链接数据库（2026-09-26 逐条联网核验），BOM「手册下载」列唯一事实源 | ~200 |
| `evse-bom.js` | BOM 构建：九列设备明细表 + CSV 导出（UTF-8 BOM） | ~300 |
| `evse-ai.js` | 大模型接入（OpenAI 兼容）：需求翻译 / BOM 补录 / 视觉诊断，仅翻译不改档位 | ~250 |
| `evse-export.js` | SVG / 网表 JSON 导出 | ~150 |
| `evse-vendor-kb.js` | **厂家电路对比知识库**：7 家 × 13 单元 × 30+ 做法 → 28 条判定规则 | ~220 |
| `evse-source.js` | **原始来源登记 + 证据图谱（V2）**：标准/器件手册/试验/现场/运行/经济/事故/假设的来源台账、要求覆盖、来源包导入导出 | ~360 |
| `evse-calc.js` | **工程校核内核（V2）**：载流/降容/压降/短路/保护/变压器/储能/热/并网缺口/消防/证据覆盖；输出证据包与 CSV | ~430 |
| `tests/` | Node 单元测试：公式、取参、来源导入与追溯 | — |
| `sources/source-pack.example.json` | 来源包导入模板（标准/手册/现场/运行/测试占位） | — |
| `proxy.js` | 本地开发服务器（默认端口 5173）：静态文件按磁盘动态服务 + `/bailian/` 反代百炼 API | ~120 |
| `manual-db.example.json` | 手册库导入模板 | — |

加载顺序在 `index.html` 中已固定，**不要改动**：`core → mwess-core → vendor-kb → source → calc → geo → labelfix → render → sim → manual-kb → bom → ai → export`（`mwess-core` 紧随 `core`，因为其符号工厂复用 `EVSE_CORE`；`calc` 依赖 `source`，其余相对次序保持原样）。

---

## 二、部署

### 最简（任意静态服务器）

把整个目录丢到 web 根目录即可：

```bash
# Nginx
cp -r deploy/* /usr/share/nginx/html/

# Apache
cp -r deploy/* /var/www/html/

# Python 临时起服务
cd deploy && python3 -m http.server 8080
```

访问 `http://<你的服务器>/index.html`。

### Nginx 参考配置

```nginx
server {
    listen 80;
    server_name evse.yourcompany.com;
    root /usr/share/nginx/html;
    index index.html;

    # JS 文件较大（合计约 250KB），开启压缩后约 60KB
    gzip on;
    gzip_types application/javascript text/html text/css application/json;
    gzip_min_length 1024;

    location / { try_files $uri $uri/ /index.html; }

    # 引擎文件带版本号发布时可长缓存
    location ~* \.js$ { expires 7d; add_header Cache-Control "public"; }
}
```

### Docker

```dockerfile
FROM nginx:alpine
COPY . /usr/share/nginx/html
```

```bash
docker build -t evse-schematic . && docker run -p 8080:80 evse-schematic
```

### 直接开文件

`index.html` 用 `file://` 双击也能打开（所有脚本都是同目录相对路径，无 fetch、无模块、无 CORS 限制）。

**浏览器要求**：Chrome / Edge / Firefox / Safari 近三年版本。用到 `ResizeObserver`、
`pointer events`、`Blob`、可选链以外的 ES5+ 语法，无需 polyfill。

---

## 三、使用

**左栏 · 设计输入** — 标准（国标 / 欧标）、功率、枪数、单枪电流、模块档位、储能容量与簇数、
耦合方式（直流 DC/DC 或交流 PCS）。点「确定性重新生成」。**同一份输入永远得到逐字节相同的输出**。

**中栏 · 图纸** — 滚轮缩放、空白处拖动平移、「适应窗口」复位。

**右栏 · 属性检查器 / 评分 / 对比库** — 选中任意对象即显示其完整属性；
评分七维实时刷新；对比库可展开查看每个功能单元的各家做法与判定规则。

### 编辑操作

| 操作 | 效果 |
|---|---|
| 点击器件 | 选中，右栏列出**全部引脚 → 对端**（点对点可追溯，悬空引脚标黄） |
| 拖动器件 | 移动后相关网络**自动重路由**（橡皮筋） |
| 点击连线 | 选中该段，右栏显示起点/终点引脚号、拐点数、布线来源 |
| 拖动连线段 | 改道，**邻线自动挤推**（间距 ≥ 6 单位） |
| 点击引脚 | 高亮所属网络，显示对端 |
| **拖动电气连接点「·」** | **汇聚于该点的所有电气线一起移动。存在两种结点：自由结点直接平移顶点并保持正交；引脚重合点则带动器件移动并重路由，保证走线永远终结在真实端子上** |
| 拖动位号文字 | 位号 / 名称 / 规格文字带独立移动 |
| 「连线」模式点两个引脚 | 新建 pin→pin 网络，自动判定能量域与线型 |
| `Delete` / `Backspace` | 删除选中的器件或连线，网表同步更新 |
| `Ctrl/Cmd + Z` / `Y` | 撤销 / 重做（40 步） |
| `Ctrl/Cmd + S` | 保存工程 JSON（V13） |
| **⚡通电仿真模式下点击开关器件** | **分闸/合闸切换，全图即时刷新带电流动画与失电灰化（V13）** |

### 新建图纸与工程管理（V13 新增）

- **新建图纸**：工具栏「新建图纸」→ 对话框选择图框规格（A4/A3/A2/A1/A0 横纵）或自定义宽高 px，填写项目名称/图名/图号/版本/编制/校核/批准 → 得到带标准图框与标题栏的**空白画布**，从元件库自主放置器件、连线、自动布线、审计评分，全流程与生成方案一致。
- **加页**：「加页」为当前工程追加空白页（多页工程）。
- **保存/打开工程**：「保存工程」导出完整工程 JSON（器件+网络+走线+图框+标题栏+开关分合状态）；「打开工程」载入 JSON 恢复现场；`Ctrl+S` 快捷保存。
- **标题栏自定义**：`design.params.tb = { dwgNo, ver, author, checker, approver, status }`，渲染时覆盖默认标题栏字段；未设置时生成方案标题栏保持原样（无回归）。
- 自定义图纸点「确定性重新生成」前会弹窗确认，防止误覆盖手工成果。

### 通电仿真（V13 新增，evse-sim.js）

点工具栏「⚡通电仿真」开启，全图即时显示带电状态；**点击任意断路器/接触器/隔离开关即分合闸操作，动画即时更新**：

- **带电网络** → 功率流动画（沿 BFS 层级自动定向，能量从电源流向负载）；**失电网络** → 灰化（透明度 16%）。
- 每个开关器件旁显示 **分（红）/ 合（绿）** 状态徽标。
- 仿真模型：端子 `(器件:引脚)` 为节点，网络/跨页符/器件内部导通为边；电源 = 进线端子排 XT*（PE 除外）+ 电池 GB*；并查集合并带电域，BFS 层级定流向。
- 导通规则：母排同名组全导通；开关合闸时极对导通（线圈端子 A1/A2 不参与）、分闸断开；两端器件（熔断器/电阻/变压器等）恒导通；功率模块 M*/PCS 全域双向（含 V2G 反向）；枪/控制器/监测装置等多端器件 = 终端负载不导通。
- SB* 按钮默认分闸（NO），其余开关默认合闸。
- 验证（120kW 国标）：QS1 分闸 → 交流主链失电 143→131 网；KM1 分闸 → 模块断电、电池侧保持；K1P/K1N 分闸 → 枪回路 13 线 10 失电；KB1P 分闸母线不变（簇 2 仍支撑 WB3，电气正确）。
- 已知简化（方案级）：控制器 A1 的 24V 输出未建模为独立源（AUX-IMD 支路不点亮）；KM 线圈互锁不自动联动，需手动逐个分合。

### Word 式 ribbon 标签栏 + 顶部抽屉（V14 布局，V15 收栏）

顶部十个标签页，分两类；当前标签与抽屉开合状态记忆在 localStorage：

| 标签 | 类型 | 内容 |
|---|---|---|
| 文件 | 按钮行 | 新建图纸 · 加页 · 保存工程 · 打开工程 |
| **设计输入** | **抽屉** | 客户口述识别 + 典型方案 + 参数表单 + 确定性重新生成（三栏横排） |
| **元器件库** | **抽屉** | 符号库搜索 + 分组多栏列表 + 🧩 新建自定义元器件（独立标签，不再常驻侧栏） |
| 编辑 | 按钮行 | 撤销 · 重做 · 选择/连线等绘图工具组 |
| 视图 | 按钮行 | 适应窗口 · 图层开关 · 显示选项 |
| 动画仿真 | 按钮行 | 工况流动画 M0~M4 · ⚡通电仿真 |
| 导出 | 按钮行 | SVG · 网表 JSON · DXF · CSV网表 · CSV-BOM · 打印PDF · 分享链接 |
| **属性/评分** | **抽屉** | 属性检查器 + 七维评分 + 厂家对比库 + 规则明细（四块横排） |
| **工程 BOM** | **抽屉** | BOM 表 + AI 补全/导出 CSV/导入手册库 |
| AI 工具 | 按钮行 | 大模型设置 · 🧩新建元器件 · 示波器 |

抽屉标签点击展开顶部下拉面板（最高 46vh 内滚动），**再点一次收起**；按钮标签点击时抽屉自动收起。左右侧栏已取消，**画布全屏**，ResizeObserver 自适应抽屉开合。页签行右侧常驻：图纸页切换 + 全局搜索（位号/网络/线号/跨页编号）。

### 自定义元器件（V14 新增）

入口：左栏元件库「🧩 新建」按钮，或 ribbon「AI 工具 → 🧩 新建元器件」。三种定义方式：

1. **手动逐个定义**：位号前缀 + 名称 + 框内标题 + 框宽/最小高度；引脚表逐行定义（引脚号 / 名称 / 所在边 left・right・top・bottom / 电气域 AC・DC・ESS・AUX・CTL・COMM・SIG・PE / 方向 in・out・bi），数量不限，右侧实时 1:1 预览符号。
2. **AI 识图**：上传芯片引脚图/原理图截图 → 大模型（需支持视觉）自动识别出名称/位号/引脚表填入编辑器，人工核对修正后保存。
3. **AI 解析文字**：粘贴芯片手册引脚定义文字 → AI 解析成结构化引脚表。

- 存储：浏览器 localStorage（`evse.customLib`），重启不丢；库内「自定义」分组支持 ✎ 编辑 / ✕ 删除（已放置实例不受影响）。
- 全链路兼容：自定义符号基于 makeBox 四边引脚模型，放置/连线/自动布线/审计评分/通电仿真/导出 SVG・DXF・JSON 全部可用；符号为纯数据对象，随工程 JSON 保存往返无损。
- 电气域（k）决定连线颜色与审计归类，方向（t）参与 DRC 校验。

### 导出

- **导出 SVG** — 当前页完整矢量图（含图框、标题栏、线型图例、设备明细表），可直接导入 CAD / Illustrator。
- **导出网表 JSON** — 器件表（含每个物理端子的端子号/端子名/能量域/方向）+ 网络表
  （每条 `from: 器件:引脚` → `to: 器件:引脚`）+ 完整评分与规则明细。**这是与 EPLAN / 端子表 /
  线束图 / 生产测试用例对接的数据入口。**

---

## 工程校核与证据链（V2 新增）

顶栏「工程校核」把“图画得好不好”和“电气是否成立”分开：

- **图纸评分**仍由原七维 DRC 给出，衡量完整性、连接、制图、可读性、符号、文档与安全单元。
- **工程校核**由 `evse-calc.js` 独立计算：交流/直流计算电流、电缆载流与降容、交直流压降、短路电流与热稳定、保护额定/开断/选择性、变压器容量、储能可用容量/C-rate/循环寿命、变流损耗与通风、并网与电能质量缺口、储能消防与气体探测、BMS/IMD/辅源单点、LCOS 数据缺口、厂家安全单元检查。
- 每个结果都有 `pass / warn / fail / unknown / na` 五种状态，并附带公式、输入、假设与来源 ID。**`unknown` 不会按通过计算**；综合校核分只代表“当前证据下的预审通过率”，不是合规认证。
- 左侧是可编辑的校核边界：并网点短路电流、变压器容量/阻抗、功率因数、效率、环境温度、成组回路、AC/DC/枪/储能电缆长度、储能功率、电池/直流短路电流等。默认值均按工程假设处理并在结果中标注。
- **原始来源登记**由 `evse-source.js` 管理：标准、datasheet、型式试验、现场资料、运行数据、经济数据、事故案例、文献与假设。来源状态为 `metadata / pending` 时不计入“已核验”；要求按 `open / partial / covered` 追踪。
- 「导入来源包」接受 `sources/source-pack.example.json` 格式；`type=site` 来源的 `data` 字段会自动预填校核边界（界面手输值优先），相关结果会记录站点来源 ID。导出证据包输出项目参数、校核结果、假设、来源登记、要求矩阵与参数/结果哈希；「导出校核 CSV」用于评审记录。
- 单元测试：`npm test`（Node 内置 test runner，覆盖载流/压降/短路公式、EVSE/MWESS 取参、来源导入与追溯）。

> 证据原则：标准原文、厂家 datasheet、现场实测、运行与测试记录才是事实源；内置参考表、默认值、二手厂家库只作为冷启动假设，必须由项目责任人用原始资料替换并归档。校核结果不替代注册电气工程师复核、并网试验、消防审批与型式试验。

---

## 四、平台是怎么判定图纸好坏的

七维加权评分，只有产生了明确校验结果的项才计分（S ≥95 · A ≥88 · B ≥78 · C ≥65 · D <65）：

| 维度 | 权重 | 代表规则 |
|---|---|---|
| A 完整性 | 22 | 进线四要素（隔离/断路/浪涌/剩余电流）、IMD + 电流采样、双侧计量、泄放、每枪独立快熔 + 正负极接触器 + 电子锁、每簇熔断 + 双极 + 预充、储能经变换器并入、24V/12V 双档、急停 + 门禁、热管理、PE |
| B 连接明确性 | 18 | B01 无悬空引脚 · B02 两端落在具名物理端子 · B03 信号点对点不共用干线 · B04 跨页连接符成对闭合 |
| C 制图规范 | 18 | C01 全正交 · C02 不穿器件 · C03 交叉一律半圆跨越 · C04 真实连接画实心结点 · **C05 平行间距 ≥8px（V12d）** · C06 栅格对齐 · C07 器件框/跨页符/标注互不重叠 · C08 走线不压文字 · C09 符号内部文字不重叠 |

### 8px 电气间隙规则（V12d/V12e）

- **线-线**：水平/垂直平行走线间距 ≥ 8px（`MIN_CLEAR=8`）；**线-器件**：走线到器件本体（含虚线禁布框，禁布框=本体+8）≥ 8px。
- `fixClear8` oracle：几何预筛 + 全审计 Pareto 验收，**严格非交换**：修框违规不得新增线-线违规，反之亦然；违规批量修复带回滚+黑名单。
- **模块走廊结构性加宽（V12e）**：WB1 M-tap 间距 110→128、WBC 间距 142→160（Δ=18），走廊 22px→40px = 4 车道 × 8px，物理上容纳干线束，一次性清零 4 个回归预设的全部 C05 error。
| D 可读性 | 10 | 平均拐点 ≤4、一次/二次分页、母排分相绘制、走线总长受控 |
| E 符号规范 | 8 | 开关功能标记、变换器 ∼/= 、熔断器进线粗线、符号来自受控库而非描图 |
| F 文档控制 | 8 | 图框/图号/修订/签署栏、图例 + 明细表遍历全部位号、状态标注、档位 RFQ_REQUIRED |
| G 功能安全检测单元 | 16 | G01~G11，由厂家对比库反向导出 |

### 厂家对比库导出的硬判据（部分）

- `V-EMC-01` 进线必须同时具备差模(X)与共模(Y)电容路径，**缺 Y 电容判不合格**
- `V-ST-02` **以 N 对 PE 电压判 N 极粘连物理不成立**（该做法在采样样本中出现，已列为不通过项）
- `V-SC-01` 短路检测回路必须能在能量传输阶段与主回路断开（双继电器 + 隔离驱动为最优范式）
- `V-CPD-01` 仅峰值检测判不出占空比异常，导引检测须能区分车辆状态档位
- `V-AUX-03` 自激式辅源纹波大，**不得给 ADC 采样链供电**
- `V-DRV-01` 每个线圈必须画出续流 / 钳位回路（本平台由符号库构造保证，零遗漏）
- `V-DI-01` 必须有车辆二极管存在检测，缺失即视为可被电阻假冒

---

## 五、当前基线与已知缺口（诚实清单，V12e · 2026-10-08）

11 预设矩阵：**6×S + 5×A**（V12c 为 4×S+7×A）：

```
240+200 储能    98.4 S        EU+AC          98.4 S
CCS2/CCS1/NACS/CHAdeMO  95.5 S ×4
120/240/480/600kW       93.9 A ×4（120kW：CAN 链 B01 warn + C08×2）
480+400 双枪储能        92.2 A（ownBody 1 warn：N208/GB4）
默认 240kW 方案          C02/C05/C11 error = 0，生成耗时 ~10s（V12c 为 2.9s，待优化）
```

遗留项（warn 级，不压 A 级下限）：

| 项 | 现状 | 根因/计划 |
|---|---|---|
| 120kW CAN 链 | B01 warn（CANH2/CANL2 未达引脚）+ C08×2 | 定向布线修复待做 |
| 480+400 ownBody | 1 warn（N208/GB4） | 需逐轮次精准拒绝（全局硬障碍实验已回滚） |
| 生成耗时 | ~10s | fixClear8 全审计迭代；计划增量审计缓存降到 <5s |
| 线-线 <8px 残余 | 5 对（CAN 差分对 + AUX 短桩） | 引脚固定，物理不可移 |

---

## 六、二次开发入口

```js
// 生成设计（纯函数，确定性）
var d = EVSE_GEO.generate({
  std: 'gb',          // 'gb' 国标 | 'ccs2' 欧标
  kw: 240, guns: 2, gunA: 250, moduleKw: 40,
  ess: true, essKwh: 200, essClusters: 2, coupling: 'dc'
});

d.devices   // 器件实例：id / tag / name / spec / sheet / zone / x / y / sym.pins[]
d.nets      // 网络：{ id, name, cls, a:{d,p}, b:{d,p} } —— 每条都是 pin→pin
d.wires     // 走线几何：{ id, net, pts:[[x,y]...], via }
d.audit     // { total, grade, score[], items[] }

// 渲染成 SVG 字符串
EVSE_RENDER.fullSVG(d, 1, { pinNo: true, pinName: true, devName: true });

// BOM
var bom = EVSE_BOM.build(d);      // { rows:[{cat,name,model,vendors,params,qty,note,doc,tags}] }
EVSE_BOM.toCSV(bom, d);           // 8 列 CSV（含 UTF-8 BOM 头）

// 大模型
EVSE_AI.cfg({ url:'https://api.deepseek.com/v1', key:'sk-xxx', model:'deepseek-chat' });
await EVSE_AI.test();                       // { ok, ms, reply }
await EVSE_AI.parseParams('双枪240kW超充带200度储能');  // { params, assumptions[] }
await EVSE_AI.enrichBOM(bom.rows, onProgress);         // { 行号: {model,vendor,doc,conf} }

// 交互 API
EVSE_GEO.reroute(d, ['KM1']);              // 移动器件后重路由
EVSE_GEO.dragSegment(d, 'W-N012', 2, 830); // 拖线段 + 挤推邻线，返回受影响线 id
EVSE_GEO.audit(d);                          // 重新跑规则

// 通电仿真（V13）
var r = EVSE_SIM.computeLive(d);
// r = { liveNets:{netId:true}, dirOf:{wireId:1|-1}, level:{端子:BFS层},
//       switches:[{id,tag,open}], liveCount, srcCount }
d.map.QS1.simOpen = true;                   // 分闸（false=合闸）
EVSE_SIM.isSwitchDev(dv);                    // 是否开关器件（sym.isSwitch）
EVSE_SIM.effectiveOpen(dv);                  // 有效分合状态（SB* 默认分闸）

// 自定义元器件（V14）：spec → 符号（四边引脚矩形框）
var sym = EVSE_CORE.makeBox({
  w: 140, minH: 72, title: '充电控制板',
  left:  [{ n: '1', name: 'CAN_H', k: 'COMM', t: 'bi' }],
  right: [{ n: '4', name: 'DO1', k: 'CTL', t: 'out' }],
  top:   [{ n: '6', name: 'ANT', k: 'COMM', t: 'bi' }],
  bottom:[{ n: '7', name: 'GND', k: 'PE', t: 'out' }]
});
// 浏览器端持久化：localStorage['evse.customLib'] = [spec,...]，启动时重建进 LIBCAT「自定义」分组
// AI 生成：EVSE_AI.chat([{role:'user',content:[{type:'text',...},{type:'image_url',image_url:{url:dataURL}}]}]) → JSON spec
```

**新增一个器件**：在 `evse-core.js` 的 `S` 对象里加一个返回
`{ w, h, draw, pins, tagAt }` 的工厂函数（`draw` 为绘图基元数组，`pins` 用 `P()` 构造），
然后在 `build()` 里 `dev({...})` 实例化、在网表段 `net(pin(...), pin(...))` 接线，
最后在 `evse-geo.js` 的 `place()` 里给坐标。

**新增一条规则**：在 `evse-geo.js` 的 `audit()` 里 `add(维度, 编号, 标题, 是否通过, 说明, 级别)`。
权重在同文件 `RUBRIC` 中调整。

**新增一个 BOM 品类**：在 `evse-bom.js` 的 `KB` 数组里加一条
`{ re: /^位号前缀/, cat: '类别', series: '系列级型号', vendors: [...], note: '选型要点' }`。
`re` 先匹配先命中，所以特例（如 `^QF1$`）要放在通则（如 `^QF\d`）之前。

**新增厂家做法**：在 `evse-vendor-kb.js` 的 `BLOCKS` 里加 `variants`（带 `pro`/`con`/`score`）
和 `rules`；若该单元需要在系统图上有实体，同时在 `G_CHECKS` 里加一条，`need` 填位号前缀。

## 手册下载链接数据库（29XX 版）
- evse-manual-kb.js v2.0：BOM「手册下载链接」列的唯一事实源，2026-09-26 逐条联网核验（20 个 BOM 链接中 13 个原链接失效，已替换/标注）
- 状态字段：ok（实测可达）/ warn（待复核、反爬或未验证）/ nohref（无公开手册，明确告知并给检索词）
- 开发者导入：EVSE_MANUAL_KB.merge(jsonObj) 或页面「BOM→导入手册库」按钮；模板见 manual-db.example.json；格式 {品类:[{vendor,title,url,status,note}]}

