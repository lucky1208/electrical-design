---
name: evse-schematic-design
description: 生成充电桩（EVSE）电气原理图与方案包：国标 GB/T、欧标 CCS2、美标 CCS1 的确定性选型计算，输出 A3 SVG 原理图、R2010 DXF 概念草图和 JSON 方案包（含 BOM 与校核清单）。当用户提到充电桩、充电堆、储能充电站、超充桩、EVSE、电气原理图、系统图、单线图、选型、功率模块/快熔/接触器/直流接触器配置、BOM，或给出功率 kW、枪数、储能 kWh 等参数想出图时，务必使用本技能，即使用户没有明确说"生成原理图"。
version: 1.1.0
author: 卢继雄
created_at: 2026-08-18
---

# 充电桩电气原理图自动设计（方案级）

把充电标准、功率、枪数与储能配置确定性地翻译成 A3 电气原理图、可编辑 DXF 概念草图与 JSON 方案包。引擎是纯确定性算法：相同输入必然得到相同输出；AI 只负责翻译自然语言需求，**不参与选型计算、不改器件档位、不改 SVG/DXF 几何**。

## 工程边界（每次交付都必须声明）

输出状态为 `CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED`：

- 不是生产图、施工图、设备报价、保护整定书、型式试验结论或标准符合性证明；
- 短路计算、保护配合、EMC、温升、绝缘、电池安全与消防、并网批复等由具备资格的专业人员完成；
- 设备目录为受控示例数据，全部条目 `RFQ_REQUIRED`。

交付回复末尾固定附上："本图为方案级概念草图，须经电气专业复核；不构成生产/施工图或合规证明。"

## 两种使用模式

- **模式 A 对话出图**（Agent 默认）：按下面“使用流程”执行。
- **模式 B Web 表单**（与平台同款下拉表单体验）：
  1. 起静态服务：`python -m http.server 8080 --directory <skill目录>\web`（或 `npx serve <skill目录>\web`）；
  2. 浏览器打开 http://127.0.0.1:8080/ ，下拉选择标准/功率/枪数/储能等参数，点“生成”即出图，可导出 SVG/DXF/JSON；
  3. 表单的 AI 需求翻译缺省为“本地规则解析”，不向外发送文本；如需服务端 AI 翻译，将 `web/` 部署到 Vercel 并配置密钥（见原平台 README）。

两种模式共用同一确定性引擎与绘图规则闸门，输出完全一致。

## 使用流程（模式 A）

1. **翻译需求**：从用户描述提取参数写成一个 JSON 对象。字段、枚举值与缺省值见 `references/parameters.md`。只提取用户明确说的；没说的用缺省值并在回复中列出假设；识别不到的特殊环境要求原文放入 `specialRequirements`。
2. **写参数文件**：把 JSON 存到输出目录，如 `params.json`。
3. **运行生成脚本**（Node ≥14，无第三方依赖；Windows PowerShell 下参数请走文件，不要内联 JSON）：

   ```powershell
   node <skill目录>\scripts\generate.js --params params.json --out <输出目录> [--name 文件名前缀]
   ```

4. **检查退出码与汇总**：
   - 退出码 0：SVG + DXF + JSON 已产出，把汇总（标准、功率链、进线/直流档位、枪回路、储能、阻断项 0）转述给用户；
   - 退出码 2：绘图规则闸门阻断（语义图 blocking>0）。**不得交付图纸**，把 JSON 中 `gates`/`drawingSkill.graphValidation` 的阻断原因报告给用户；
   - 退出码 1：参数或运行错误，按 stderr 修正参数后重试。
5. **交付**：把 `.svg`、`.dxf`、`.json` 三个文件路径给用户，并附工程边界声明。

## 典型参数示例

```json
{
  "pileName": "示范站 480kW 液冷超充桩",
  "site": "上海",
  "standard": "gb",
  "outputKw": 480,
  "gunCount": 3,
  "gunCurrentA": 250,
  "moduleKw": 40,
  "voltageWindow": "500-1000",
  "thermal": "liquid",
  "essEnabled": true,
  "essKwh": 200,
  "essPowerKw": 120,
  "essCoupling": "dc",
  "specialRequirements": ["沿海高盐雾环境：防腐等级与外壳防护待项目确认"]
}
```

## 禁止事项

- 不修改 `engine/` 下任何文件；引擎升级时整体替换 `engine/` 并提升 version。
- 不在渲染器里写坐标字面量：位置进 `placement.js`，走线交给 `router.js`。
- 不在渲染器里维护"已知缺口白名单"：网表回路未画出的例外只能登记在
  `drawing-skill.js` 的 `UNDRAWN_CIRCUITS` 并写明理由（渲染器不能自我开脱）。
- 不手工编辑生成的 SVG/DXF 数值或几何；发现问题调整输入参数重新生成。
- 不把标准名称（GB/T、IEC、UL）当作自动合规结论输出。
- 闸门阻断时不绕过、不"先给用户看看"——fail-closed 是本技能的安全底线。

## 目录结构

```text
SKILL.md                  本文件
scripts/generate.js       Node 一键生成（选型→闸门→SVG→DXF→JSON）
scripts/minidom.js        Node 侧 DOMParser shim（仅 DXF 导出用，浏览器不加载）
engine/                   确定性引擎（分层：选型 → 工程模型 → 布局 → 布线 → 渲染 → 闸门）
  engine.js               确定性选型计算
  design-model.js         EDEM 工程模型：设备 + 命名端口 + 回路（网表）
  placement.js            布局层：分区/基准线/设备 bbox/端口锚点/走线通道/障碍物
  router.js               布线层：通道模型 + 区间图着色分配轨道 + 障碍避让
  draw-pile.js            渲染层：只把布局与布线结果翻译成 SVG，不做几何决策
  symbols.js              符号库 + A3 图框 + 交叉半圆统一后处理 resolveCrossings
  drawing-skill.js        绘图规则闸门（含 G050/G051/G052 图↔网表一致性）
  component-library.js    国标/欧标 PDF + sch_lib 四源提取的关键元器件库与约束
references/parameters.md  输入参数契约与自然语言翻译规则
references/sch-lib-drawing-rules.md  sch_lib 参考图提炼的绘图规则包说明
web/                      可选 Web 表单前端（index.html + js/，模式 B）
```










