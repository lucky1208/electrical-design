# AIDC 电气方案设计平台 (electrical-design)

输入数据中心基本参数，一键生成符合 **IEC 60617 / GB/T 4728 / GB 50174** 标准的 4 张工程图纸：

| 图纸 | 说明 |
|---|---|
| AIDC 系统架构图 | 双路市电 → 中压配电 → 变压器 → UPS/三层储能 → STS → 列头柜 → GPU 机柜 + 液冷支路 |
| AIDC 电气一次接线图 | 双列单线图：进线隔离开关/断路器/CT/PT/避雷器/变压器/0.4kV 分段母线/UPS/STS/PDU/接地 |
| AIDC 双路供电拓扑图 | 两路独立电源全程冗余路径，N+1/2N 标注，无单点故障校验 |
| AIDC 液冷管路图 | P&ID 流程：冷却塔 → 冷水机 → 一次泵 → CDU → 供回水集管 → 冷板机柜，含定压补水/漏液检测/传感器 |

纯前端确定性引擎（无 LLM 依赖、无需 API Key），同一配置永远输出同一套图纸。

## 本地运行

```bash
npx serve .        # 或任意静态服务器，打开 http://localhost:3000
```

## 部署到 Vercel

方式一（推荐，持续集成）：GitHub 仓库 → Vercel Dashboard → Add New Project → 导入本仓库 → Deploy（零配置）。
方式二（CLI）：`npm i -g vercel && vercel --prod`

## 目录结构

```
index.html          页面（表单 + 图纸标签页 + BOM/参数）
js/symbols.js       IEC 60617 / GB-T 4728 符号库 + CAD 图框/标题栏/图例组件
js/engine.js        确定性工程设计引擎（选型/整定/冗余/液冷/BOM，含 skill 约束）
js/draw-arch.js     系统架构图渲染
js/draw-wiring.js   电气一次接线图渲染（双列单线）
js/draw-dual.js     双路供电拓扑图渲染
js/draw-cooling.js  液冷管路图渲染（P&ID）
js/app.js           表单交互/标签页/导出
tests/engine.test.js 引擎自检（node tests/engine.test.js）
```

## 设计约束（来自 skills）

- LLM 只做翻译，不做决策 —— 本平台图纸 100% 由确定性规则引擎生成
- SLD 审图 Skill：图框/标题栏/图例完整，母线 ≥3 倍普通线宽，能量流实线/信息流虚线，交叉连接=实心圆，电压等级全图标注，高低压分区虚线
- 热管理 Skill：CDU N+1，供水 35℃/回水 45℃（GPU 高温液冷），冷板流量 5~8L/min/模组，304 不锈钢管材，漏液检测 <5s 关断
- 保护 Skill：进线三段式保护、变压器差动、零序保护、防孤岛/防逆流
- 标准依据：GB 50174-2017 / GB 50052-2009 / GB/T 4728 / IEC 60617 / TIA-942 / ASHRAE TC9.9