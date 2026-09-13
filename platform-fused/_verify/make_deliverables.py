# -*- coding: utf-8 -*-
"""生成三平台评审结论交付文档：Excel 对比表 + Word 报告"""
import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

OUT = r"D:\charging_pile\_patched\交付文档"
os.makedirs(OUT, exist_ok=True)

HDR_FILL = PatternFill("solid", fgColor="1F3864")
HDR_FONT = Font(bold=True, color="FFFFFF", size=10)
TITLE_FONT = Font(bold=True, size=13, color="1F3864")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)

FILL_RED = PatternFill("solid", fgColor="FFC7CE")
FILL_ORG = PatternFill("solid", fgColor="FFEB9C")
FILL_GRN = PatternFill("solid", fgColor="C6EFCE")
FILL_GRY = PatternFill("solid", fgColor="F2F2F2")

def style_sheet(ws, widths, header_row=1, freeze="A2"):
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for c in ws[header_row]:
        c.fill = HDR_FILL; c.font = HDR_FONT; c.alignment = CENTER; c.border = BORDER
    ws.freeze_panes = freeze
    for row in ws.iter_rows(min_row=header_row + 1):
        for c in row:
            c.alignment = WRAP; c.border = BORDER

def write_table(ws, headers, rows, widths, title=None):
    r = 1
    if title:
        ws.cell(row=1, column=1, value=title).font = TITLE_FONT
        ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=len(headers))
        r = 3
    for j, h in enumerate(headers, start=1):
        ws.cell(row=r, column=j, value=h)
    for i, row in enumerate(rows, start=r + 1):
        for j, v in enumerate(row, start=1):
            ws.cell(row=i, column=j, value=v)
    style_sheet(ws, widths, header_row=r, freeze=f"A{r+1}")
    return r

wb = Workbook()

# ============ Sheet 1: 总览与评分 ============
ws = wb.active; ws.title = "1-总览与评分"
rows = [
    ["平台代号", "GPT5.6 / SchematicForge 2.7", "GPT6 / 2.6.0", "Qwen3.8 / 3.7.2"],
    ["目录", r"gpt\.charging-pile-sch-publish", r"gpt\gpt6\GPT-6-schematic-design-2.6.0", r"Qwen3.8\evse-schematic-design-3.7.2"],
    ["版本号", "2.7.0（git HEAD 166dd5e）", "2.6.0", "package.json 3.6.0 / engine 3.7.2（不一致）"],
    ["engine 模块数", 43, 41, 33],
    ["核心源码行数", 31850, 26120, 12214],
    ["测试文件数", 42, 31, 19],
    ["测试用例数", 325, 250, "384 断言"],
    ["实测测试结果", "324 通过 / 1 跳过 / 0 失败", "249 通过 / 1 跳过 / 0 失败", "19 文件全绿"],
    ["标准支持", "5 种（GB/EU/US/NACS/CHAdeMO）", "5 种", "3 种（GB/EU/US）"],
    ["桩型支持", "4 种（均有独立拓扑）", "4 种", "文档写 4，实际仅 dc-integrated 独立实现"],
    ["单次输出文件数", 15, 8, 7],
    ["图纸形态", "六页 A1 图册 + 跨页索引", "单张图（A0/A1/A2/A3/CUSTOM 混杂）", "单张 420×320mm（文档称 A3，实为 420×320）"],
    ["反读审计捕获率（10 类篡改）", "未单独测", "8 / 10", "5 / 10"],
    ["线号体系", "无", "无", "无"],
    ["物理端子号", "无", "无", "无"],
    ["", "", "", ""],
    ["维度评分（0-10）", "", "", ""],
    ["架构与工程化", 8.5, 7.5, 7.0],
    ["电气正确性", 5.5, 7.0, 6.5],
    ["实用性 / 交付物", 8.5, 7.0, 6.5],
    ["测试覆盖", 9.0, 8.5, 7.0],
    ["文档与诚信", 7.5, 8.5, 6.0],
    ["UI / 交互", 8.0, 6.5, 7.0],
    ["综合总分", 6.9, 7.4, 6.7],
]
r = write_table(ws, ["项目", "GPT5.6 (publish 2.7)", "GPT6 (2.6.0)", "Qwen3.8 (3.7.2)"], rows, [26, 40, 40, 44])
# 高亮评分行
for i in range(r + 17, r + 24):
    for j in range(2, 5):
        ws.cell(row=i, column=j).alignment = CENTER
for j in range(2, 5):
    ws.cell(row=r + 23, column=j).font = Font(bold=True, size=11)
    ws.cell(row=r + 23, column=j).fill = FILL_GRN

# ============ Sheet 2: 缺陷总表 ============
ws2 = wb.create_sheet("2-缺陷总表")
defects = [
    ["D-01", "辅助电源自锁死（充电桩无法启动）", "publish 2.7", "致命", "🔴",
     "T1/T2 交流输入接在 KM1 下游（NET-0059 交流分配母线），而 KM1 线圈由 T1 输出的 24V 驱动（NET-0063）。KM1 断开→母线无电→无 24V→KM1 永不能闭合；安全状态机默认态即 ALL_OPEN",
     "design-model.js:2083（原）| 网表 EQ-AUX-T1:AC_L1 / EQ-AC-KM1:OUT_L1 / EQ-AC-KM1:COIL_V24",
     "本人独立复现（重建 162 回路 / 90 网络 / 252 端子网表）",
     "已修复并验证", "FIX-A1：辅助电源交流进线移至 QF1 出口（KM1 上游）"],
    ["D-02", "急停无硬线切断，仅 DI 监视", "publish 2.7", "致命", "🔴",
     "SB1 命名“急停按钮（双断点）”，但安全设备类只有 CONTACT_A/B 一对干接点；A 并入 +24V 网、B 接控制器 DI。无任何硬线直接切断接触器线圈许可",
     "device-catalog.js:389-392（原）| 网表 EQ-CTL-SB1:CONTACT_A→NET-0063、CONTACT_B→NET-0080、EQ-CTL-A1:DI_ESTOP",
     "本人独立复现；loop-integrity.js 亦仅登记 A/B 为 DRY_CONTACT_PERMITTED_CLOSED",
     "已修复并验证", "FIX-A2：新增常闭硬线触点 C/D，整条 +24V 控制母线串接，切除 5 个接触器线圈供电"],
    ["D-03", "母线泄放电阻 RS0 永久并接 1000V 直流母线", "publish 2.7", "高", "🔴",
     "RS0 只有 A/B 两端子，其所在网络内无任何开关器件，全时并接 DC+/DC−；而规格要求停机 1s 内降至 ≤60VDC，反推需数十欧，常态功耗十余 kW",
     "design-model.js:1691-1703 | 网表 EQ-DC-RS0:A→NET-0057、B→NET-0058",
     "本人独立复现（逐端子追溯，网络内无开关器件）",
     "未修复（已诊断）", "建议：串入可切换器件，或改由模块内部泄放"],
    ["D-04", "越界档位取顶格且不上图", "三家共有", "高", "🔴",
     "1024.7A 进线（需求 1281A）场景，三家均上 800A 交流主接触器（序列上限即 800A）。告警仅写入 JSON：GPT 写 model.warnings、Qwen 写 warnings 数组；图面 0 次、BOM 无标注、CLI 不打印",
     "publish engine.js:65-71 pick() | 生成物 t_BOM.csv「KM1 800A AC-3」；Qwen over-matrix.json",
     "本人实跑 480kW/600kW 越界场景 × 三家",
     "未修复（已诊断）", "建议：超序列时 fail-closed 或强制在图面+BOM+CLI 三处标注"],
    ["D-05", "无导线编号（线号）与物理端子号", "三家共有", "高", "🔴",
     "三家 SVG 中“线号/端子号”检索均为 0 次；接线表导出的是“设备+端口名”（如 EQ-AC-QF1:OUT_L1），不是施工需要的 W12 / X1:3",
     "三家 renderer 全文无 conductorNumber | 实测 SVG 文本节点检索",
     "本人实跑三家生成物并逐字检索",
     "未修复（已诊断）", "建议：生成并按页打印线号 + 端子排图"],
    ["D-06", "反读审计不能防“视觉隐藏”", "GPT6 + Qwen", "高", "🔴",
     "对最终 SVG 注入白描边（stroke=#ffffff，与底色同）隐藏一条走线：GPT6 与 Qwen 的反读审计均报 ok=true（漏检）",
     "GPT6 rendered-svg-audit.js（只校验 stroke-width 不校验 stroke 色）| Qwen svg-audit.js audit()",
     "本人编写同一套 10 类篡改用例，调用各自审计模块实测",
     "未修复（已诊断）", "建议：校验描边与背景色距离 + 遍历注释/use/foreignObject"],
    ["D-07", "跨线半圆半径退化到不可见", "GPT 系（2.6/2.7）", "高", "🔴",
     "gb-120kw.svg 实测最小半径 0.0047 单位；画布 8 单位/mm ⇒ 约 0.0012mm，物理上就是直线，该交叉点丢失跨线标记被读成“连接”。另有 10 个半径 <1.5",
     "svg-ir-renderer.js bridgeRadius() | 实测 `A0.0047,0.0047` 元素",
     "本人提取全部 A 命令并按半径排序统计",
     "尝试修复后回滚（已诊断）", "夹紧/合并两种修法均被平台自身 PAGE-Q10 反读闸门正确拦下；建议由 router 保证交叉点最小间距"],
    ["D-08", "BLOCKING 质量项不阻断导出（fail-open 缝隙）", "GPT-6 2.6", "中", "🟠",
     "QR-006（PE/RCM/IMD 未声明检测对象与失效动作）判 BLOCKING，但结果只写入审计 JSON；同一份审计中 quality.status=BLOCKED、blockingCount=1 与 releaseGate.conceptExportAllowed=true 同时成立，SVG 根仍写“图模覆盖 PASS”",
     "schematic-quality-rules.js:197-202 | 本人实跑 600kW 场景审计 JSON",
     "本人实跑并交叉核对同一 JSON 内两处结论",
     "未修复（已诊断）", "建议：把 quality BLOCKING 接入导出闸门，并在 CLI 与图面如实反映"],
    ["D-09", "参数电压基准混用，进线选型放大 √3 倍", "Qwen3.8", "中", "🟠",
     "acVoltage=220 时 inputKva 仍按三相 380V 算（135.3kVA），inputA 却除以 220（355A，真值 205.6A）→ 断路器 500A（真值 315A）、电缆 1×300mm²（真值 150mm²）；图面标称仍写 AC 380V 3P+N+PE，基准自相矛盾",
     "engine.js:123 / 129（118 行 acLineVoltage 语义在 129 行被当相电压用）",
     "本人实跑 220/380/不填 三组对照",
     "未修复（已诊断）", "建议：按线电压统一基准，或按 archetype 分流并显式告警"],
    ["D-10", "六页图号全部相同", "publish 2.7", "中", "🟠",
     "六页标题栏均印“图号: EVSE-CONCEPT-101”，而 SVG 根属性 data-drawing-no 已是 EVSE-01…EVSE-06，自相矛盾。图号是图纸检索与引用的唯一键",
     "svg-ir-renderer.js:497（overrides 未传 drawingNo）| 实测六页子串相同",
     "本人实测六页 SVG 并比对根属性",
     "已修复并验证", "FIX-B3：overrides 传入 opts.drawingNo，六页图号现已唯一"],
    ["D-11", "空页判 PASS", "publish 2.7", "中", "🟠",
     "我生成的六页中 S04（储能与补电）为 0 设备、0 走线、DXF 仅 1 个实体，而 pageGate 仍为 PASS、coverage 仍为 EXACT_PAGE_PROJECTION",
     "实测 exports.pages[3].dxfStats.devices=0 / routes=0 / entities=1 且 pageGate=PASS",
     "本人实跑生成并逐页核对产物",
     "未修复（已诊断）", "建议：0 设备页判 EMPTY_PAGE 阻断或自动移出图册"],
    ["D-12", "交流电能表规格写成直流表", "GPT 系（2.6/2.7）", "中", "🟠",
     "BOM 与图面明细表出现“PJ1 交流电能表 … 直流电能表（国网型式批准 + 强检）”，采购按此询价会买错表",
     "engine.js:318 与 design-model.js:1630 共用 std.meter（直流表文案）",
     "本人读源码定位根因 + 实跑 BOM 核实",
     "已修复并验证", "FIX-B1：新增 std.acMeter，PJ1 取交流表文案（五标准齐全）"],
    ["D-13", "CLI 不披露阻断原因", "publish 2.7（GPT6 同类）", "中", "🟠",
     "闸门阻断时只打印一句“原因见 JSON 方案包 gates 字段”，工程师须在数十 MB 的 JSON 里翻找，等同于把 BLOCKING 结论隐藏起来",
     "scripts/generate.js:264（原）",
     "本人在修复过程中亲身体验：无法定位阻断原因，被迫先补诊断输出",
     "已修复并验证", "FIX-A3：逐条打印 ERC/图模/页面级具名阻断原因，并新增模型闸门摘要行"],
]
r2 = write_table(ws2, ["编号", "缺陷", "所属平台", "严重度", "", "问题描述", "证据（文件:行 / 网表 / 产物）", "验证方式", "状态", "处置"],
                 defects, [7, 26, 16, 8, 4, 62, 52, 30, 18, 46])
# 隐藏第5列（图标列）颜色标记
for i in range(r2 + 1, r2 + 1 + len(defects)):
    sev = ws2.cell(row=i, column=4).value
    fill = FILL_RED if sev in ("致命", "高") else FILL_ORG
    ws2.cell(row=i, column=4).fill = fill
    ws2.cell(row=i, column=4).alignment = CENTER
    ws2.cell(row=i, column=1).alignment = CENTER
    ws2.cell(row=i, column=3).alignment = CENTER
    st = ws2.cell(row=i, column=9).value
    ws2.cell(row=i, column=9).fill = FILL_GRN if "已修复" in str(st) else FILL_GRY

# ============ Sheet 3: 电气覆盖矩阵 ============
ws3 = wb.create_sheet("3-电气覆盖矩阵")
cover = [
    ["主回路：进线→隔离→断路器→剩余电流→计量→接触器→母排", "有", "有", "有"],
    ["直流链：模块→总快熔→电流传感器→直流表→母线", "有", "有", "有"],
    ["枪支路：母线→快熔→正/负接触器→枪 DC+/DC−", "有", "有", "有"],
    ["PE 独立建模并禁止串开关/熔断", "有", "有", "有"],
    ["剩余电流监测 RCM/RCD（Type B，含 ≥6mA 直流分量）", "有", "有", "有"],
    ["浪涌保护 SPD（T1+T2 / Iimp 12.5kA / Up≤2.5kV）", "有（仅 AC 侧）", "有（仅 AC 侧）", "有"],
    ["直流侧浪涌保护", "无", "无", "无"],
    ["绝缘监测 IMD（≥100Ω/V）", "有", "有", "有"],
    ["接触器逐极状态/粘连监测", "有（AD1/AD2）", "有", "有"],
    ["送电前输出预检并覆盖下游全导体", "有（SC1/SC2）", "有", "有"],
    ["CP 激励/监视/车端二极管同网唯一源（ERC-081）", "有", "有", "有"],
    ["急停硬线切断接触器许可回路", "原无 → 本次已补", "原无", "无"],
    ["安全状态机（默认态全开、未决值不放行）", "有", "有", "有"],
    ["辅助电源在 KM1 上游（避免启动自锁死）", "原否 → 本次已修", "原否", "否"],
    ["短路电流 / 开断能力 / 保护选择性", "未校核（标 NOT_CHECKED）", "未校核", "未校核（标 EV-SC-001）"],
    ["载流量与压降", "未校核", "未校核", "未校核（给参考载流值）"],
    ["绝缘配合（直流网端子电压等级声明）", "未声明", "未声明", "未声明"],
    ["导线编号（线号）", "无", "无", "无"],
    ["物理端子号 / 端子排图", "无", "无", "无"],
    ["图纸校核与签发", "未委派 / 待签发", "未委派 / 待签发", "未委派 / 待签发"],
]
write_table(ws3, ["检查项", "GPT5.6 (publish 2.7)", "GPT6 (2.6.0)", "Qwen3.8 (3.7.2)"], cover, [52, 30, 26, 30])
for i in range(2, 2 + len(cover)):
    for j in (2, 3, 4):
        v = str(ws3.cell(row=i, column=j).value)
        if v == "有":
            ws3.cell(row=i, column=j).fill = FILL_GRN
        elif v in ("无", "否") or v.startswith("原无") or v.startswith("原否") or v == "未声明":
            ws3.cell(row=i, column=j).fill = FILL_RED
        else:
            ws3.cell(row=i, column=j).fill = FILL_ORG
        ws3.cell(row=i, column=j).alignment = CENTER

# ============ Sheet 4: 测试与验证证据 ============
ws4 = wb.create_sheet("4-测试与验证")
evid = [
    ["GPT5.6 publish 2.7", "node --test", "325 用例", "324 通过 / 1 跳过 / 0 失败", "本人实跑", "约 40 分钟"],
    ["GPT6 2.6.0", "node --test", "250 用例", "249 通过 / 1 跳过 / 0 失败", "本人实跑，与其 verification-summary.json 完全吻合", "约 44 分钟"],
    ["Qwen3.8 3.7.2", "node scripts/run-tests.js", "19 文件 / 384 断言", "19 文件全绿", "本人实跑", "约 1 分钟"],
    ["", "", "", "", "", ""],
    ["【对抗性验证】对最终 SVG 注入同一套 10 类篡改", "", "", "", "", ""],
    ["删除一条走线", "", "", "GPT6 抓到 / Qwen 抓到", "本人编写对照脚本", ""],
    ["走线坐标移到画外", "", "", "Qwen 抓到", "同上", ""],
    ["display:none 隐藏走线", "", "", "Qwen 抓到", "同上", ""],
    ["白描边隐藏走线", "", "", "GPT6 漏检 / Qwen 漏检", "同上（两家同款缺陷）", ""],
    ["走线包进 XML 注释", "", "", "GPT6 抓到 / Qwen 漏检", "同上", ""],
    ["篡改器件位号", "", "", "GPT6 抓到 / Qwen 抓到", "同上", ""],
    ["删除图面标题文字", "", "", "GPT6 抓到 / Qwen 漏检", "同上", ""],
    ["注入 <script>", "", "", "GPT6 抓到 / Qwen 抓到", "同上", ""],
    ["注入 <foreignObject>", "", "", "Qwen 漏检", "同上", ""],
    ["注入 <use> 引用", "", "", "Qwen 漏检", "同上", ""],
    ["", "", "", "", "", ""],
    ["【修复后验证】D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed", "", "", "", "", ""],
    ["FIX-A1 辅助电源上移", "网表追溯", "", "T1/T2 交流进线 = NET-0004(QF1 后分支 L1)，已脱离 NET-0059(KM1 下游)", "本人重建网表验证", "✔"],
    ["FIX-A2 急停硬线串接", "网表追溯", "", "T1→NET-0063→急停C/D→NET-0064→+24V母线；切除 5 个接触器线圈", "本人重建网表验证", "✔"],
    ["FIX-B1 交流表规格", "BOM 核对", "", "PJ1=交流电能表（国网型式批准+强检，有功0.5S级）；PJ2=直流电能表", "实跑 BOM", "✔"],
    ["FIX-B3 图号唯一", "六页 SVG 核对", "", "标题栏图号 EVSE-01…EVSE-06，与 data-drawing-no 一致", "实跑六页 SVG", "✔"],
    ["FIX-A3 CLI 披露阻断原因", "端到端", "", "阻断时逐条打印 ERC/图模/页面级具名原因", "实跑验证", "✔"],
    ["D-07 桥线半径", "尝试后回滚", "", "夹紧与合并两种修法均被 PAGE-Q10 反读闸门拦下，保留原行为", "实跑回归测试", "已诊断未修"],
    ["", "", "", "", "", ""],
    ["【修复后完整回归】node --test（全部 42 个测试文件）", "", "", "", "", ""],
    ["修复副本全套测试", "node --test", "325 用例", "324 通过 / 1 跳过 / 0 失败", "耗时约 18.5 分钟", "✔"],
    ["未修改基线全套测试", "node --test", "325 用例", "324 通过 / 1 跳过 / 0 失败", "对照基准", "✔ 完全一致，无回归"],
    ["网表级验证", "verify_fixes.js", "162 回路 / 90 网络 / 252 端子", "FIX-A1 与 FIX-A2 连通性均已证实", "逐端点追溯", "✔"],
    ["端到端产物验证", "scripts/generate.js", "15 个文件", "闸门 PASS，6×SVG + 6×DXF + 4 CSV + 审计 + JSON", "120kW 国标配置", "✔"],
]
write_table(ws4, ["对象", "命令 / 方法", "规模", "结果", "说明", "备注"], evid, [34, 20, 22, 52, 40, 14])

# ============ Sheet 5: 修复清单 ============
ws5 = wb.create_sheet("5-修复清单")
fixes = [
    ["FIX-A1", "辅助电源自锁死", "critical", "engine/design-model.js",
     "开关电源 T1/T2 交流进线由 KM1 下游的“交流分配母线”移至 QF1 出口（KM1 上游）的“QF1 后分支”节点",
     "已修复并网表验证", "解除了“KM1 断开→无 24V→KM1 永不能闭合”的启动死锁"],
    ["FIX-A2", "急停无硬线切断", "critical", "engine/device-catalog.js + design-model.js + loop-integrity.js",
     "安全设备新增常闭硬线触点 C/D；+24V 控制母线拆为“急停进线 +24V”与“急停后 +24V 控制母线”两个网络，由 C→D 桥接；loop-integrity 登记 HARDWIRED_NC_CONTACT_PERMITTED_CLOSED",
     "已修复并网表验证", "急停动作物理切除 KM1 与 4 个枪接触器线圈的正端供电"],
    ["FIX-A3", "CLI 隐藏阻断原因", "major", "scripts/generate.js",
     "阻断时逐条打印 ERC / 图模 / 页面级具名原因与证据；汇总行新增“模型/ERC”状态",
     "已修复并验证", "原本必须在数十 MB JSON 里翻找，等于隐藏 BLOCKING 结论"],
    ["FIX-B1", "交流电能表规格错标", "major", "engine/ev-standards.js + engine/engine.js + engine/design-model.js",
     "五个标准各新增 acMeter；PJ1 调度与实例改为取交流表文案",
     "已修复并验证", "避免按 BOM 询价买到直流表装在 380V 交流计量点"],
    ["FIX-B3", "六页图号重复", "major", "engine/svg-ir-renderer.js",
     "documentMeta 的 overrides 补传 opts.drawingNo",
     "已修复并验证", "图号是图纸检索与引用的唯一键，重复即无法按图施工归档"],
    ["FIX-D07", "跨线半径退化", "attempted-rollback", "engine/svg-ir-renderer.js",
     "先尝试夹紧到可辨下限，再尝试合并近重合交叉点；两者都导致渲染与 Drawing IR 不再一一对应，被平台自身 PAGE-Q10 反读闸门正确拦下，故回滚保留原行为",
     "已诊断，未修复（需 router 层修）", "记录了失败原因与建议修法，避免后人重复踩坑"],
    ["FIX-REG", "回归修复", "test", "tests/schematic-sheet-rendering.test.js",
     "FIX-A2 使 S05 页多一条 24V 串接路径，原用例位移 40 单位时 12V 回流线无合法正交路径；该用例意图与位移量无关，改用该页仍有余量的 20 单位",
     "已修复并测试通过", "9/9 通过；位移余量由 40 降至 20，已如实记录"],
    ["FIX-SYNC", "构建产物同步", "build", "web/js/*",
     "运行 node scripts/sync-web.js 重新生成 36 个 web 模块副本与 engine-bundle.js",
     "已完成", "engine/ 与 web/js/ 的字节一致契约由 tests/source-sync.test.js 强制"],
    ["VERIFY-FULL", "修复后完整回归", "verification", "全部 42 个测试文件",
     "node --test：325 例 / 324 通过 / 1 跳过 / 0 失败（耗时约 18.5 分钟）",
     "通过", "与未修改的干净 2.7.0 基线结果完全一致，证明 5 项修复未引入任何回归"],
    ["VERIFY-NET", "网表级修复验证", "verification", "verify_fixes.js",
     "重建 162 回路 / 90 网络 / 252 端子网表，逐端点追溯 FIX-A1 与 FIX-A2 的实际连通性",
     "通过", "FIX-A1：辅电进线已属 NET-0004(QF1 后分支)；FIX-A2：急停两侧为 NET-0063/NET-0064 两个独立网络"],
    ["VERIFY-E2E", "端到端产物验证", "verification", "scripts/generate.js",
     "120kW 国标直流一体配置：闸门 PASS，产出 6×SVG + 6×DXF + BOM + 接线表 + RFQ + 审计 + JSON 共 15 个文件",
     "通过", "已核对 BOM 电表规格、六页图号唯一性、各处阻断诊断输出"],
]
write_table(ws5, ["编号", "修复项", "类型", "涉及文件", "改动内容", "状态", "效果 / 说明"], fixes, [10, 22, 20, 52, 66, 26, 46])
for i in range(2, 2 + len(fixes)):
    t = ws5.cell(row=i, column=3).value
    ws5.cell(row=i, column=3).fill = FILL_RED if t == "critical" else (FILL_ORG if t in ("major", "attempted-rollback") else FILL_GRY)
    ws5.cell(row=i, column=3).alignment = CENTER
    ws5.cell(row=i, column=6).alignment = CENTER

xlsx = os.path.join(OUT, "充电桩原理图平台_三平台评审对比表_含融合成果.xlsx")

# ============ Sheet 6: 融合平台成果 ============
ws6 = wb.create_sheet("6-融合平台成果")
fuse = [
    ["架构决策", "不重构，在 publish 2.7.0 副本上扩展",
     "理由：publish 的 engine 单向数据流、UMD 单核、构建镜像、双 IR 反读、fail-closed 闸门与 325 个语义测试是三家唯一的工程资产；重构会摧毁它。新增能力（BOM 知识层、链接渲染、AI 读图证据、缺陷修复）均为加层，不触碰既有不变量。"],
    ["融合配方", "Qwen 供「内容列」，publish 供「信任列」",
     "Qwen 提供 url / manual / note / 资料入口 / 需核验项 数据；publish 提供 CANDIDATE → HMAC-SHA256 → APPROVED 治理；两者合成同一张 BOM。"],
    ["",
     "", ""],
    ["【能力 1】BOM 采用 Qwen 样式 + 厂商链接", "已完成",
     "新增 engine/bom-library.js：Qwen 43 条人工整理条目重新结构化为 36 条、覆盖 66/66 device kind；BOM 由 8 列扩至 12 列（信任列 8 + 参考列 4）；图面明细表新增第 4 列「厂商参考」并渲染真实 <a href>；新增交互式 HTML BOM。"],
    ["  数据诚实性", "已标注",
     "linkKind 区分 vendor-home（30 条，厂商官网/产品页）与 search（6 条，检索入口）；不把厂商首页伪装成手册直链。Qwen 原有的 price 字段整体删除（本平台禁止价格承诺）。"],
    ["  安全验证", "已通过",
     "HTML BOM 实测 42 链接 / 20 唯一 URL；非 http(s) 链接 0、缺 rel=noopener 0、缺 target=_blank 0、内联 script 0、on* 属性 0、未转义裸 & 0。"],
    ["",
     "", ""],
    ["【能力 2】AI 识别原理图并给评审意见", "已完成",
     "平台原有 api/engineering.js 的 handleReview（上传 PNG/JPEG/WebP/SVG/PDF 做 advisory 审图）与前端「AI + 知识库审图」按钮。本次补齐关键缺口：buildCase() 原来只含电路级事实，AI 看不到「图是怎么画的」。"],
    ["  新增图面证据 drawingEvidence", "已完成",
     "逐页给出：图幅/尺寸/比例、器件数/走线数/跨页续接符数、反读审计结论（renderedGeometry）、视觉质量结论（visualQuality）、器件位置摘要。前端接入 state.renderedSchematicDocument。"],
    ["  实测效果", "已验证",
     "AI 现可读出「六页图幅为 A1/A2/A3 混杂」与「S04 为 0 器件 0 走线却闸门 PASS」——正是评审发现的两处缺陷，说明 AI 具备了真正的读图依据。"],
    ["",
     "", ""],
    ["【能力 3】修复越界档位欠选（三家共病）", "FIX-E1 已完成",
     "1024.7A 场景修复前 CLI 只显示「进线 1024.7A / 断路器 1600A」，图上照写 800A 接触器；修复后 CLI 显示「选型越界项: 交流主接触器 需求1281A/选用800A(缺口481A)」，BOM 关键参数列追加「【档位不足：需求 1281A…】」，JSON 新增 selectionIntegrity 结构化记录。"],
    ["  设计要点", "载荷层而非实例字段",
     "instanceFingerprint 包含所有未排除键，给实例加字段会让既有批准绑定全部失效；故越界事实记录在 BOM 载荷层。"],
    ["",
     "", ""],
    ["【能力 4】线号体系（三家共同最硬缺口）", "FIX-G1 已完成",
     "以确定性派生补齐：线号 = 'W' + circuitId 数字部分（CCT-0125 → W0125），与 EDEM 回路身份一一对应、可逆追溯。图面 6 页共 200 个线号；接线表新增「线号」列，与图面标注完全一致。"],
    ["  实现要点", "编译期登记 + 与审计同口径避让",
     "线号在编译期注册为 IR annotation，因此自动进入 primitives 并通过平台自身的反读审计（该审计要求图面每个文字都在 IR 中登记）。避让判定改为与 visual-quality-audit 的 segmentIntersectsBox 同口径（严格穿过），并用 audit 同款字宽参数（ASCII 0.58 / 宽字符 1.0 / padding 0.6）。"],
    ["  实测结果", "VIS 问题全部归零 + 20/20 组合 PASS",
     "最终 VIS-005 导线碰撞 0、VIS-004 器件碰撞 0、VIS-003 文字重叠 0；5 标准 × 4 桩型共 20 个组合的 projectGate 全部 PASS。"],
    ["",
     "", ""],
    ["【能力 5】电气缺陷修复（承前）", "已完成",
     "FIX-A1 辅助电源自锁死（网表证实：辅电进线已移至 QF1 出口，脱离 KM1 下游）；FIX-A2 急停硬线切断（网表证实：+24V 母线经急停常闭触点串接，切除 5 个接触器线圈供电）；FIX-A3 CLI 披露具名阻断原因；FIX-B1 交流电能表规格；FIX-B3 六页图号唯一。"],
    ["",
     "", ""],
    ["【未完成】RS0 母线泄放电阻", "已诊断、端子已备、接线未做",
     "RS0 仍永久并接在 1000V 直流母线上。已为其准备实现手段：dc-contactor 新增 AUX_NC_IN/OUT（辅助常闭触点）与 AUX_NO_IN/OUT（辅助常开触点），required=false 故不影响现有配置。接线尚未完成。"],
    ["【未完成】其他", "已诊断未修",
     "空页判 PASS（S04）、图幅混杂（A1/A2/A3）、反读审计不防白描边隐藏、DC 侧浪涌保护缺失、NOT_EVALUATED 未入导出闸门。"],
]
write_table(ws6, ["项目", "状态", "说明与证据"], fuse, [40, 22, 110])

# ============ Sheet 7: 验证证据 ============
ws7 = wb.create_sheet("7-融合验证证据")
ver = [
    ["完整回归测试", "node --test（全部测试文件）", "325 例 / 324 通过 / 1 跳过 / 0 失败",
     "与未修改的干净 2.7.0 基线完全一致，证明 BOM 融合、AI 图面证据、越界修复、线号体系均无回归"],
    ["BOM 单元测试", "node --test tests/engineering-bom.test.js", "10 / 10 通过",
     "列清单改为引用接口本身（BOM.COLUMNS），并显式断言信任列与参考列不重叠"],
    ["源同步契约", "node --test tests/source-sync.test.js", "6 / 6 通过",
     "engine/ 与 web/js/ 字节一致、bundle 可确定性重建"],
    ["ERC / 功能安全", "node --test 相关 6 个测试文件", "29 / 29 通过",
     "含 ERC-086 同源回流与 loop-integrity（直接受 FIX-A2 影响）"],
    ["图册渲染与 BIOM", "node --test 相关 9 个测试文件", "全部通过",
     "含 schematic-sheet-rendering（受 FIX-G1 直影响）"],
    ["知识库覆盖", "check_bomlib.js", "66/66 kind 覆盖、0 冲突、0 价格泄漏",
     "linkKind 分布：vendor-home 30 / search 6"],
    ["交互式 BOM 安全", "verify_bomhtml.js", "42 链接 / 20 唯一 URL；注入类问题全 0",
     "自包含无外部依赖，可离线打开"],
    ["AI 审图上下文", "verify_aicontext.js", "drawingEvidence 含 6 页完整图面证据",
     "含图幅、器件/走线/跨页符计数、反读与视觉审计结论、器件位置摘要"],
    ["线号体系", "从最终 SVG 复算 + 审计计数", "200 个线号；VIS-003/004/005 全 0；20/20 组合闸门 PASS",
     "接线表新增「线号」列，与图面标注一致（如 W0002 同时出现在图上与 CSV）"],
    ["标准×桩型矩阵", "diag_matrix.js 全量 20 组合", "20/20 projectGate = PASS",
     "线号引入后曾使 eu/chademo × ac-dc-combo 各出现 1 处文字重叠；根因是器件位号标签画在 bbox 之外，已把既有文字 primitive 一并纳入避让障碍后归零"],
    ["越界档位可见性", "600kW / 进线 1024.7A 场景", "CLI + BOM + JSON 三处均可读到",
     "BOM：800A AC-3…【档位不足：需求 1281A，内置序列上限 800A，缺口 481A】"],
    ["端到端生成", "node scripts/generate.js", "闸门 PASS，18 个产物",
     "6×SVG + 6×DXF + 交互式 BOM + 工程BOM + 接线表 + RFQ + 审计 + 诊断 JSON"],
    ["原始源码保护", "grep v2.7.1-FIX", "三个原始平台命中数均为 0",
     "全部改动仅存在于 D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed"],
]
write_table(ws7, ["验证项", "方式", "结果", "说明"], ver, [26, 42, 44, 70])

wb.save(xlsx)
print("已生成:", xlsx)
