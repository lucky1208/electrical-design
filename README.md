# AIDC 电气方案设计平台

面向 AI 数据中心早期方案比较的、可追溯的工程概念平台。表单输入经过确定性工程模型后，生成 A3 方案级 SVG 图纸、可编辑 DXF 概念草图、计算记录、受控目录估算、待校核清单和 JSON 方案包。

> 重要边界：本项目输出是 `CONCEPT_DRAFT—PROFESSIONAL_REVIEW_REQUIRED`，不是施工图、设备报价、保护整定书、规范符合性证明或任何 Tier 认证。项目适用标准、现场资料、专业计算和签发必须由具备相应资格的专业人员完成。

## 当前能力

| 输出 | 内容 | 明确边界 |
|---|---|---|
| 系统架构图 | 供电、IT 与热管理的方案级架构 | 单路径方案不会伪装为 A/B 双路 |
| 电气一次接线图 | 概念进线、变压器、低压、UPS、PDU、接地 | 保护配合、二次原理、电缆与端子表待深化 |
| 双路供电拓扑图 | PDU-A / PDU-B 至 GPU 双输入机柜的独立逻辑路径 | 物理隔离、维护策略及共因失效待验证 |
| 液冷 P&ID | CDU、一次/二次侧、冷机、冷却塔、TT/FT/PT 概念点位 | 扬程、压降、NPSH、阀门失效位和联锁矩阵待专项计算 |
| 热管理方案图 | 冷板 → CDU → 一次侧 → 外部散热链路 | 年度 PUE/WUE、自然冷却小时和性能曲线待模拟 |
| DXF 草图 | 由 SVG 基础图元导出的 R2010 DXF（单位 mm） | 曲线/复杂符号需用项目 CAD 模板复核 |

## 工程模型原则

- `js/design-model.js` 产生唯一的 AIDC Engineering Design Model（ADEM）；设备、回路、A/B 路径和冷却对象均有稳定 ID。
- `js/engine.js` 只进行可复现的概念计算。液冷热负荷从 IT 负荷与液冷比例计算，**不**把 PUE 差值当作 IT 散热量。
- `js/draw-*.js` 只读取 ADEM/计算结果渲染，不能另行决定设备数量或拓扑。
- AI 只翻译自由文本与解释确定性结果；AI 不能改写计算、选型评分、保护策略或 SVG 几何。
- 设备目录与价格为受控示例数据，所有条目均标记 `RFQ_REQUIRED`；只能用于方案比较，不能作为询价或采购依据。

## 本地运行与校验

```bash
npm run check
npm test
npx serve .
```

浏览器打开静态站点后，可使用本地规则解析；若不配置服务端 AI，平台仍可完整运行。

## 可选的服务端 AI

浏览器从不接收、保存或提交 API Key。可选 AI 仅经同源 `POST /api/ai` 访问，密钥仅设置在 Vercel 环境变量中：

| Provider | Required environment variable | Optional model variable |
|---|---|---|
| Kimi | `MOONSHOT_API_KEY` | `KIMI_MODEL` |
| DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_MODEL` |
| GLM | `ZHIPUAI_API_KEY` | `ZHIPUAI_MODEL` |

部署后，在 Vercel Project Settings → Environment Variables 设置上述变量，然后重新部署。不要把密钥写入 `index.html`、客户端 JavaScript、Git 仓库、截图或自然语言需求框。

## Vercel 部署

导入 Git 仓库即可部署静态前端和 `api/ai.js`。`vercel.json` 为 API 配置 `no-store`，并设置基础安全响应头。生产环境还应在 Vercel 中限制环境变量访问、启用 GitHub MFA/部署保护，并定期审查日志。

## 目录结构

```text
index.html            表单、结果展示与工程边界说明
api/ai.js             同源 AI 代理（无浏览器 API Key）
js/design-model.js    ADEM 规范化工程模型
js/vendors.js         带单位与目录状态的受控示例目录
js/engine.js          确定性概念计算、BOM 和待校核记录
js/symbols.js         SVG 图框、标题栏、符号与图例组件
js/dxf-export.js      SVG 基础图元 → R2010 DXF 概念草图
js/draw-*.js          五张方案级图纸渲染器
js/app.js             表单、AI 需求翻译、导出与状态展示
tests/                引擎回归、A3 元数据和文字重叠检查
```

## 标准使用方式

图纸表达可将 IEC 61082（文件编制）、IEC 60617（图形符号）、IEC 81346（参考代号）等作为项目标准基线的输入；短路、配电、成套设备、P&ID/仪表、建筑/消防及地区法规必须按项目合同、适用版本和当地主管部门要求由专业团队确认。仓库不会把这些标准名称当作自动合规结论。
