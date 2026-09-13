# -*- coding: utf-8 -*-
"""生成三平台评审结论 Word 交付文档"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn

OUT = r"D:\charging_pile\_patched\交付文档"
os.makedirs(OUT, exist_ok=True)

doc = Document()
# 中文字体
st = doc.styles["Normal"]
st.font.name = "微软雅黑"
st.font.size = Pt(10.5)
st.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
for s in doc.sections:
    s.top_margin = Cm(2.2); s.bottom_margin = Cm(2.2)
    s.left_margin = Cm(2.4); s.right_margin = Cm(2.4)

NAVY = RGBColor(0x1F, 0x38, 0x64)
RED = RGBColor(0xC0, 0x00, 0x00)

def h(text, level=1):
    p = doc.add_heading(text, level=level)
    for r in p.runs:
        r.font.color.rgb = NAVY
        r.font.name = "微软雅黑"
        r.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    return p

def para(text, bold=False, color=None, size=10.5, align=None):
    p = doc.add_paragraph()
    r = p.add_run(text); r.bold = bold; r.font.size = Pt(size)
    r.font.name = "微软雅黑"
    r.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    if color: r.font.color.rgb = color
    if align: p.alignment = align
    return p

def bullet(text, level=0, bold=False, color=None):
    p = doc.add_paragraph(text, style="List Bullet")
    p.paragraph_format.left_indent = Cm(0.75 + level * 0.6)
    for r in p.runs:
        r.font.name = "微软雅黑"; r.font.size = Pt(10.5)
        r.bold = bold
        if color: r.font.color.rgb = color
        r.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    return p

def table(headers, rows, widths=None):
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = "Light Grid Accent 1"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, hh in enumerate(headers):
        c = t.rows[0].cells[i]
        c.text = ""
        r = c.paragraphs[0].add_run(hh); r.bold = True; r.font.size = Pt(9.5)
        r.font.name = "微软雅黑"; r.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = ""
            r = cells[i].paragraphs[0].add_run(str(v)); r.font.size = Pt(9)
            r.font.name = "微软雅黑"; r.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
    if widths:
        for i, w in enumerate(widths):
            for row in t.rows:
                row.cells[i].width = Cm(w)
    return t

# ==================== 封面 ====================
p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
r = p.add_run("充电桩电气原理图自动生成平台\n三平台全方位评审报告"); r.bold = True
r.font.size = Pt(20); r.font.color.rgb = NAVY
r.font.name = "微软雅黑"; r.element.rPr.rFonts.set(qn("w:eastAsia"), "微软雅黑")
para("")
para("评审对象：GPT5.6 / SchematicForge 2.7 · GPT6 / 2.6.0 · Qwen3.8 / 3.7.2",
     align=WD_ALIGN_PARAGRAPH.CENTER, size=11)
para("评审方式：源码通读 + 端到端实跑 + 对抗性注入 + 网表逐端子追溯",
     align=WD_ALIGN_PARAGRAPH.CENTER, size=11)
para("本报告所有结论均由评审者亲自复算或实跑得出；凡引用他人结论者，均经独立复核后标注",
     align=WD_ALIGN_PARAGRAPH.CENTER, size=9.5)
doc.add_page_break()

# ==================== 1 执行摘要 ====================
h("一、执行摘要", 1)
para("本次评审对三个 AI 平台生成的充电桩电气原理图自动生成系统做了源码级审查与实测验证。"
     "核心结论如下：", size=10.5)

para("1. 三个平台不是并列关系，而是同一技术谱系的两条支线", bold=True)
bullet("GPT6 2.6.0 与 GPT5.6 publish 2.7 同源：89 个文件逐字节相同，同参数下电气计算完全一致"
       "（120kW → 进线 195.4A / 断路器 250A / 母线 500A / 总快熔 630A，一个数不差）。")
bullet("但演化方向是 GPT2.5 → GPT6 2.6 → publish 2.7。经 SHA-256 复核：2.6 的交付包"
       "（d643f180…）与复核报告（EC9350EB…）正是 publish 2.7 文档里登记的“复核对象”，"
       "且 publish 明确否决了 2.6 的页集编译器路线。")
bullet("Qwen3.8 是完全独立实现（与 GPT 系无任何文件哈希重合），代码量约为前者的 38%。")

para("2. 没有一个是可直接用于施工的平台，三家的自我定位“方案级草案，须专业校核签发”是准确的", bold=True)
bullet("三家都没有导线编号（线号）与物理端子号 —— 这是对实用性打击最大的共同缺口，"
       "接线表导出的都是“设备+端口名”而非施工需要的 W12 / X1:3。")
bullet("三家的短路电流、开断能力、保护选择性、载流量压降、绝缘配合均未校核（且都诚实标注了）。")
bullet("三家都禁止将输出标记为生产图/施工图，并禁止 IFC 标签，边界声明值得肯定。")

para("3. 发现 13 项缺陷，其中 3 项属致命级", bold=True, color=RED)
bullet("D-01 辅助电源自锁死：T1/T2 开关电源的交流输入接在主接触器 KM1 下游，而 KM1 线圈"
       "由这两个电源输出的 24V 驱动 —— 形成死锁，充电桩在默认状态下永远无法启动。"
       "该缺陷逃过了平台自己 325 个测试。", bold=True)
bullet("D-02 急停无硬线：急停按钮被建模为控制器的一个 DI 监视输入，没有任何硬线直接切断"
       "接触器线圈许可回路，与其自身命名“双断点”矛盾。", bold=True)
bullet("D-04 越界档位取顶格且不上图：1024.7A 进线（需求 1281A）场景下三家均上 800A 主接触器，"
       "告警只写入 JSON 深处，图面、BOM、CLI 均不提示。", bold=True)

para("4. 已在新副本中完成 5 项修复并通过验证（原始源码未做任何改动）", bold=True)
bullet("修复副本：D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed（基于干净的 2.7.0 git HEAD）")
bullet("已修复：辅助电源自锁死、急停硬线切断、CLI 披露阻断原因、交流电能表规格错标、六页图号重复")
bullet("验证方式：重建 162 回路 / 90 网络 / 252 端子网表逐端点追溯 + 端到端生成 + 回归测试")

doc.add_page_break()

# ==================== 2 方法与可信度 ====================
h("二、评审方法与可信度声明", 1)
para("为避免“看文档下结论”的常见失真，本报告采用五类互相独立的证据，且优先采信可复算者：")
table(["证据类型", "具体做法", "可复核性"],
      [["亲跑生成", "三平台 CLI 共 34 组参数端到端生成，含越界、非法、极端参数", "产物留存，可重跑"],
       ["亲跑测试", "GPT5.6 325 例、GPT6 250 例、Qwen 19 文件 384 断言，全部跑完", "命令与结果已记录"],
       ["亲读产物", "对生成的 SVG/DXF/CSV/JSON 逐字段核查：DXF 实体普查、SVG 可见文字节点提取、BOM 逐行比对", "脚本可复跑"],
       ["对抗性注入", "对两平台最终 SVG 注入同一套 10 类篡改，调用各自反读审计模块验伤", "对照脚本已留存"],
       ["哈希与网表溯源", "MD5 全量比对、git 历史、SHA-256 血统链、逐端子连通性回溯", "哈希值可当场复算"]],
      [3.2, 9.5, 3.3])

para("")
para("本报告主动更正了评审过程中出现过的三处错误，以保持结论可靠：", bold=True)
table(["曾出现的错误结论", "实际情况", "更正手段"],
      [["“GPT6 由 publish 分支而来、是功能回退”",
        "方向相反。真实血缘为 GPT2.5 → GPT6 2.6 → publish 2.7；相对其真底座 2.5，2.6 是纯增量无删减",
        "复算三份基线 zip 的 SHA-256 并核对 publish 文档的复核对象登记"],
       ["“Qwen acVoltage=220 被静默替换为 380V”",
        "不准确。真实缺陷是电压基准混用：inputKva 按三相线电压算、inputA 却除以相电压，导致进线选型放大 √3 倍",
        "重跑 220 / 380 / 不填 三组对照并逐字段读 JSON"],
       ["“GPT6 跨线语义已正确导出”",
        "不完整。只数了 ARC 数量（3195 个）未量半径；实测存在半径 0.0047 单位的退化圆弧，等于没画",
        "提取全部 A 命令按半径排序统计"]],
      [5.5, 7.0, 4.0])

doc.add_page_break()

# ==================== 3 平台逐个评审 ====================
h("三、三个平台逐个评审", 1)

h("3.1 GPT5.6 / SchematicForge 2.7（publish）", 2)
para("综合评分 6.9 / 10 —— 工程完成度最高，但内容有硬伤", bold=True)
para("做得最好的地方：")
bullet("交付物最完整：单次运行产出 15 个文件（6 页 SVG + 6 页 DXF + 工程 BOM + 精确 PIN 接线表 + "
       "RFQ 澄清表 + 审计证据 + 项目 JSON），是三家中唯一做到图册级交付的。")
bullet("多页投影设计是真的：crossPageCoverage 同时验证“内部回路恰好出现一次”与“跨页回路成对出现”，"
       "六页全部 PASS；实测 131 条回路 = 63 内部 + 68 跨页 ×2 = 136 个配对续接符。")
bullet("DXF 是可用工程文件：AC1024(R2010)、$INSUNITS=4(mm)、10 个带颜色线型线宽的 EVSE 图层，"
       "单页含 3195 个 ARC（跨线半圆确实导出了）。")
bullet("测试最重且断言的是电气语义：325 用例，含 5 标准 × 4 桩型的 20 组合矩阵、破坏变异、"
       "外来 EDEM 拒绝、页编辑后跨页 PIN 身份保持；12 条 ERC 为真实网表语义。")
bullet("诚实边界：constructionDrawingAllowed=false、forbiddenLabels 禁止“施工图/IFC”、"
       "9 条 NOT_CHECKED 显式声明。")

para("致命问题：", bold=True, color=RED)
bullet("D-01 辅助电源自锁死（见缺陷总表），且 325 个测试无法发现 —— 测试证明的是模型自洽性，"
       "不是电气可运行性。", bold=True)
bullet("D-02 急停无硬线（见缺陷总表）。平台在输出侧的硬件做得很好（逐极接触器、辅助触点反馈、"
       "粘连监测、送电前预检全在网表里），唯独最本质的急停安全链是软的。", bold=True)
bullet("D-03 母线泄放电阻 RS0 永久并接 1000V 直流母线，其所在网络内无任何开关器件。", bold=True)
bullet("D-11 空页判 PASS：我生成六页中 S04 为 0 设备 0 走线、DXF 仅 1 个实体，pageGate 仍为 PASS。")
bullet("复杂度失控：43 个 engine 模块、142KB 的 erc.js、157KB 的 design-model.js，无静态类型。")

h("3.2 GPT6 / 2.6.0", 2)
para("综合评分 7.4 / 10 —— 最诚实的一个", bold=True)
para("这家最值得肯定的一点：验证证据是真的。")
bullet("verification/verification-summary.json 声称 250 用例 / 249 通过 / 1 跳过，"
       "我实跑结果与之完全吻合；且它明确标注 browserE2E: NOT_RUN_LOCAL_PREVIEW_BLOCKED —— "
       "没跑就说没跑。这是三个平台里唯一经得起复核的自证材料。")
bullet("功能安全质量报告最专业：10 条 QR 规则带 evidenceRefs 引到真实项目文档页码，"
       "并主动暴露自身不足（QR-006 未声明 PE/RCM/IMD 检测对象、QR-013 有 252 个必需端子 pinMap 未决、"
       "9 个维度中 4 个明确标 NOT_ASSESSED）。")
bullet("反读审计最强：我的 10 类篡改实测捕获 8 类，包括删除走线、走线包进 XML 注释、"
       "篡改器件位号、注入 script。")
bullet("examples/ 里带真实生成产物（GB 120kW 七页 + EU 240kW 八页），可离线查验。")

para("问题：", bold=True)
bullet("D-08 BLOCKING 质量项不阻断导出：同一份审计里 quality.status=BLOCKED、blockingCount=1 "
       "与 releaseGate.conceptExportAllowed=true 同时成立，SVG 根还写“图模覆盖 PASS”。")
bullet("D-07 跨线半圆半径退化到 0.0047 单位（约 0.0012mm），该交叉点会丢失跨线标记。")
bullet("图幅完全失控：同一套 GB 七页实测为 A1/A0/A1/A3/A1/A2/A2 —— A0 与 A3 混装、横竖向不一。")
bullet("JSON 巨型冗余：单份 22.6MB，其中 drawingIR 重复存了 3 份；"
       "examples/output-gb/gb-120kw.json 更高达 23.7MB 与代码同目录。")
bullet("D-12 交流电能表规格写成直流表，采购按 BOM 询价会买错表。")

h("3.3 Qwen3.8 / 3.7.2", 2)
para("综合评分 6.7 / 10 —— 最轻、最好读，但有一处会造成选型错误", bold=True)
para("优点：")
bullet("最轻最快最易懂：12,214 行（publish 的 38%），全套测试 1 分钟跑完，数据流单向无循环依赖。")
bullet("图纸排版最贴合中国工程师习惯：单页 420×320mm 一次画完 7 个功能分区，含图例与设备明细表。")
bullet("诚实标注细致：EV-SC-001 NOT_CHECKED（短路电流未校核）、breakingKa 标注“待计算书确认”、"
       "电缆标注参考载流值，并明确禁止把档位当整定依据。")
bullet("最有工程味：直流快熔落到具体厂商型号族（好利来 HOLLYFUSE），"
       "references/ 里有 GB 44263 交流短路、回路权衡、参考网表等中国现场知识沉淀。")
bullet("fail-closed 是真的：3 枪/4 枪配置被 G064/G065 正确阻断，不产出错误图纸。")

para("问题：", bold=True)
bullet("D-09 电压基准混用（本次更正后的精确描述）：acVoltage=220 时 inputKva 仍按三相 380V 算，"
       "inputA 却除以相电压 220，导致进线电流 355A（真值 205.6A）→ 断路器 500A（真值 315A）、"
       "电缆 1×300mm²（真值 150mm²）；而图面标称仍写 AC 380V 3P+N+PE，基准自相矛盾。", bold=True)
bullet("桩型是纸面功能：文档列 4 种，代码只有 dc-integrated 与 ac-pile 两个真实分支；"
       "dc-split 实测 4 枪被阻断，ess-mobile 与 dc-integrated 仅差标题文字。")
bullet("图幅与文档不符：文档 3 处称 A3 横向，实测 420×320mm（A3 标准为 420×297mm）。")
bullet("版本号四处不一致：package.json 3.6.0 / engine.js 3.0.0 / SKILL.md 3.7.2 / 代码注释 v3.5.0-v3.6.0 混杂。")
bullet("反读审计最弱：10 类篡改仅捕获 5 类，漏检包括删除图面标题、注入 <use>/<foreignObject>、"
       "走线包进注释；根因是正则文本比对且只校验已登记文字。")

doc.add_page_break()

# ==================== 4 电气正确性 ====================
h("四、从电气正确性角度的横向结论", 1)

h("4.1 三家共同做对的事", 2)
bullet("主回路拓扑完整：进线 → 隔离 → 断路器 → 剩余电流/计量 → 接触器 → 母排 → 模块 → 快熔 → 接触器 → 枪。")
bullet("安全器件建模到位：RCD（Type B，含 ≥6mA 直流分量）、SPD（T1+T2）、急停、门禁、"
       "IMD（≥100Ω/V）、接触器逐极粘连监测、送电前输出预检。")
bullet("PE 独立建模并禁止串开关或熔断；CP 激励/监视/车端二极管同网唯一源有明确规则。")
bullet("都不越权：输出均标记 CONCEPT_DRAFT，禁止当施工图。")

h("4.2 三家共同的系统缺陷", 2)
table(["缺陷", "证据", "后果"],
      [["越界档位取顶格且不上图", "1024.7A 场景三家均上 800A 接触器（需求 1281A），"
        "告警只在 JSON", "工程师签图时看不到，直接采信为 800A → 主接触器过热失效"],
       ["无导线编号 + 无物理端子号", "三家 SVG 检索“线号/端子号”均为 0 次",
        "图纸不能用于施工接线，需人工二次编号"],
       ["反读审计不能防视觉隐藏", "白描边隐藏走线：GPT6 与 Qwen 双双漏检",
        "交付后图形可被“看不见的方式”篡改而审计仍报 PASS"]],
      [4.0, 6.5, 4.5])

h("4.3 单点差异", 2)
bullet("交流/单相处理：GPT 系显式拒绝不一致的 acVoltage（“acVoltage=220V 与接口标准 gb 的已验证"
       "输入电压 380V 不一致”），并为美标/NACS 正确建模单相 240V；Qwen 存在电压基准混用。"
       "→ GPT 正确，Qwen 有实质缺陷。")
bullet("接口标准覆盖：GPT 系 5 种（含 NACS / CHAdeMO / CCS1 / CCS2，且 NACS 三相进线与车辆侧"
       "单相复用触点分开建模、CHAdeMO 保留十个独立物理触点，都有测试断言）；Qwen 仅 3 种。→ GPT 明显更强。")
bullet("分断能力/SPD/RCD 参数：三家均为写死常量，不随供电点短路容量变化，"
       "但三家都标注了“待计算书确认”，属已知边界而非隐瞒。")

doc.add_page_break()

# ==================== 5 缺陷与修复 ====================
h("五、缺陷清单与本次修复", 1)
para("完整缺陷表见 Excel 交付文档“2-缺陷总表”。以下为致命与高severity项摘要：")
table(["编号", "缺陷", "平台", "严重度", "状态"],
      [["D-01", "辅助电源自锁死（充电桩无法启动）", "publish 2.7", "致命", "已修复并验证"],
       ["D-02", "急停无硬线切断，仅 DI 监视", "publish 2.7", "致命", "已修复并验证"],
       ["D-03", "母线泄放电阻 RS0 永久并接 1000V 母线", "publish 2.7", "高", "已诊断未修"],
       ["D-04", "越界档位取顶格且不上图", "三家共有", "高", "已诊断未修"],
       ["D-05", "无导线编号与物理端子号", "三家共有", "高", "已诊断未修"],
       ["D-06", "反读审计不能防白描边隐藏", "GPT6 + Qwen", "高", "已诊断未修"],
       ["D-07", "跨线半圆半径退化到不可见", "GPT 系", "高", "尝试修复后回滚"],
       ["D-08", "BLOCKING 质量项不阻断导出", "GPT6 2.6", "中", "已诊断未修"],
       ["D-09", "电压基准混用致进线选型放大 √3", "Qwen3.8", "中", "已诊断未修"],
       ["D-10", "六页图号全部相同", "publish 2.7", "中", "已修复并验证"],
       ["D-11", "空页判 PASS", "publish 2.7", "中", "已诊断未修"],
       ["D-12", "交流电能表规格写成直流表", "GPT 系", "中", "已修复并验证"],
       ["D-13", "CLI 不披露阻断原因", "publish 2.7", "中", "已修复并验证"]],
      [1.6, 6.0, 2.4, 1.8, 3.0])

h("5.1 已完成的修复（副本内，原始源码未改动）", 2)
para("修复副本路径：D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed"
     "（基于干净 2.7.0 git HEAD，与源仓库未提交的 2.7.1 改动完全隔离）", bold=True)

para("FIX-A1 辅助电源自锁死（critical）", bold=True)
bullet("改动：engine/design-model.js —— 开关电源 T1/T2 的交流进线由 KM1 下游的“交流分配母线”节点，"
       "移至 QF1 出口（KM1 上游）的“QF1 后分支”节点。")
bullet("验证：重建网表，EQ-AUX-T1:AC_L1 与 EQ-AUX-T2:AC_L1 现属 NET-0004(QF1 后分支 L1)，"
       "已完全脱离 NET-0059(KM1 下游交流分配母线)。")

para("FIX-A2 急停硬线切断（critical）", bold=True)
bullet("改动：device-catalog.js 为安全设备新增常闭硬线触点 CONTACT_C/D（bidirectional，"
       "因无源机械触点两向导通，required=false 使仅做监视的门禁允许悬空）；"
       "design-model.js 把 +24V 控制母线拆为“急停进线 +24V”与“急停后 +24V 控制母线”"
       "两个独立网络，由 C→D 一条桥串接（与平台既有的断路器/NACS 许可建模范式一致）；"
       "loop-integrity.js 登记 HARDWIRED_NC_CONTACT_PERMITTED_CLOSED 导通关系。")
bullet("验证：T1:OUT_V24 与 SB1:CONTACT_C 同属 NET-0063，SB1:CONTACT_D 与 +24V 母线同属 NET-0064，"
       "两网络不同 → 真正串接。急停动作将物理切除 5 个接触器线圈的正端供电"
       "（KM1、K1P、K1N、K2P、K2N）。")
bullet("过程记录：该修复触发了 3 类连锁失败（SQ1 必接端子未连接、ERC-040 把同一元件两触点误判为自环、"
       "ERC-086 同源回流断开），逐一修正后才通过；其中 ERC-040 的判定过粗（同设备即自环）"
       "本身也是一个既有缺陷，一并修正为“同一端子才算自环”。")

para("FIX-A3 CLI 披露阻断原因（major）", bold=True)
bullet("改动：scripts/generate.js —— 阻断时逐条打印 ERC / 图模 / 页面级具名原因与证据；"
       "汇总行新增“模型/ERC”状态与 blockingCount。")
bullet("意义：原本阻断只打印一句“原因见 JSON 方案包 gates 字段”，工程师须在数十 MB 的 JSON 里翻找，"
       "等同于把 BLOCKING 结论隐藏起来。")

para("FIX-B1 交流电能表规格（major）", bold=True)
bullet("改动：ev-standards.js 五个标准各新增 acMeter 文案；engine.js 的 PJ1 调度与 "
       "design-model.js 的 PJ1 实例改为取交流表文案。")
bullet("验证：BOM 现为“PJ1 交流电能表 … 交流电能表（国网型式批准 + 强检，有功 0.5S 级）”"
       "与“PJ2 直流电能表 … 直流电能表（国网型式批准 + 强检）”，不再错标。")

para("FIX-B3 六页图号唯一（major）", bold=True)
bullet("改动：engine/svg-ir-renderer.js —— documentMeta 的 overrides 补传 opts.drawingNo。")
bullet("验证：六页标题栏图号现为 EVSE-01…EVSE-06，与 SVG 根属性 data-drawing-no 一致。")

h("5.2 修复后的验证结果", 2)
para("修复不是“改完就算”，而是以三道独立验证收口：", bold=True)
table(["验证", "方式", "结果"],
      [["完整回归测试", "node --test（全部 42 个测试文件）",
        "325 例 / 324 通过 / 1 跳过 / 0 失败，耗时约 18.5 分钟"],
       ["基线对照", "在未修改的干净 2.7.0 上跑同一套测试",
        "325 例 / 324 通过 / 1 跳过 / 0 失败 —— 与修复后完全一致，证明 5 项修复未引入回归"],
       ["网表级验证", "重建 162 回路 / 90 网络 / 252 端子网表，逐端点追溯",
        "FIX-A1：T1/T2 辅电进线已属 NET-0004(QF1 后分支 L1)，脱离 NET-0059(KM1 下游)；"
        "FIX-A2：急停两侧为 NET-0063 与 NET-0064 两个独立网络，C→D 桥接，"
        "切除 KM1 与 4 个枪接触器共 5 个线圈的正端供电"],
       ["端到端产物", "scripts/generate.js 生成 120kW 国标配置",
        "闸门 PASS，产出 6×SVG + 6×DXF + BOM + 精确 PIN 接线表 + RFQ 澄清表 + 审计证据 + 项目 JSON 共 15 个文件"],
       ["BOM 规格核对", "逐行比对设备 BOM",
        "PJ1 = 交流电能表（国网型式批准 + 强检，有功 0.5S 级）；PJ2 = 直流电能表 —— 不再错标"],
       ["图号唯一性", "六页 SVG 标题栏与根属性比对",
        "EVSE-01…EVSE-06 逐页唯一，与 data-drawing-no 一致"]],
      [3.0, 6.0, 7.0])
para("")
para("需要如实说明的一处代价：FIX-A2 使 S05（辅助电源页）增加了一条 24V 串接路径，占用该页布线通道，"
     "使 EQ-AUX-M2 的可位移余量由 40 单位降至 20 单位。该页在 dx≤20 与负方向位移均正常，"
     "拓扑正确性不受影响；相应回归用例已按“位移量与用例意图无关”改为 20 单位，并在测试注释中记录了原因。", size=10)

h("5.3 一次失败的修复尝试（如实记录）", 2)
para("D-07 跨线半圆半径退化，我尝试了两种修法，都被平台自身的反读闸门正确拦下：", bold=True)
bullet("方案一“夹紧到可辨下限”：把过小半径提升到阈值。结果渲染几何与 Drawing IR 不再一致，"
       "被 PAGE-Q10（独立读取最终 SVG 必须与 Drawing IR 完全相符）拦下。")
bullet("方案二“合并近重合交叉点”：合并后 SVG 上的跳线数量与 IR 标记不再是多对多关系，"
       "同样被 PAGE-Q10 拦下。")
bullet("结论：两种修法都不成立，已回滚保留原渲染行为。建议的真修法是由 placement/router 层"
       "保证相邻交叉点的最小间距，从源头消除不可能正当渲染的几何。此记录可避免后人重复踩坑。")

doc.add_page_break()

# ==================== 6 评分与建议 ====================
h("六、评分与行动建议", 1)
table(["维度", "GPT5.6 (2.7)", "GPT6 (2.6)", "Qwen3.8 (3.7.2)"],
      [["架构与工程化", "8.5", "7.5", "7.0"],
       ["电气正确性", "5.5", "7.0", "6.5"],
       ["实用性 / 交付物", "8.5", "7.0", "6.5"],
       ["测试覆盖", "9.0", "8.5", "7.0"],
       ["文档与诚信", "7.5", "8.5", "6.0"],
       ["UI / 交互", "8.0", "6.5", "7.0"],
       ["综合总分", "6.9", "7.4", "6.7"]],
      [4.0, 3.6, 3.6, 4.0])
para("")
para("说明：publish 2.7 的电气正确性由 8.0 下调至 5.5 —— 它的框架（12 条真语义 ERC、325 测试、"
     "双 IR 反读、66 类符号无 fallback）是三家中最好的，但内容包含三处会导致“充电桩启动不了 / "
     "母线全时放电 / 急停不硬切”的原理性错误，且其测试架构上不可能发现它们。"
     "“框架优秀 + 内容有硬伤”故综合分被拉低。GPT6 因无这三条致命缺陷且验证证据可复核而居首。", size=10)

h("6.1 若继续投入，建议的修复优先级", 2)
table(["优先级", "事项", "落地位置"],
      [["P0", "辅助电源移至主接触器上游（或独立供电）", "design-model.js（本次副本已修）"],
       ["P0", "急停改为硬线切断接触器线圈许可回路，器件库支持常闭触点", "device-catalog.js（本次副本已修）"],
       ["P0", "越界档位改为阻断或强制三处标注（图面+BOM+CLI）", "三家 pick() 逻辑"],
       ["P1", "补线号与物理端子号体系（三家共同最硬缺口）", "三家 renderer"],
       ["P1", "反读审计增加抗视觉隐藏：校验描边与背景色距离、遍历注释与 use/foreignObject", "rendered-svg-audit.js / svg-audit.js"],
       ["P1", "NOT_EVALUATED / BLOCKING 质量项接入导出闸门", "erc.js / schematic-quality-rules.js"],
       ["P1", "由 router 保证交叉点最小间距，消除退化跨线", "schematic-placement.js / router"],
       ["P2", "R S0 串入可切换器件或改由模块内部泄放", "design-model.js"],
       ["P2", "0 设备页判 EMPTY_PAGE 阻断或移出图册", "schematic-document.js"]],
      [1.8, 8.5, 5.0])

h("6.2 使用建议", 2)
bullet("三家平台的自我定位是准确的：仅供方案比较与工程深化输入，不可作为生产/施工图依据。")
bullet("若用于方案比选与内部深化：建议用 GPT5.6 publish 2.7 的图册能力（交付物最全），"
       "但必须先落实 D-01/D-02/D-03 三项电气修复，否则图纸存在功能性错误。")
bullet("若看重证据可追溯与自我审计：选 GPT6 2.6，其验证日志与质量报告是唯一经复核可信的自证材料。")
bullet("若追求轻量与可读、且为直流一体式单页总图：Qwen3.8 的单页排版最易懂，"
       "但须先修电压基准混用（D-09），并注意其桩型与图幅的宣传与实现不符。")

para("")
para("附：本次评审的修复副本位于 D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed，"
     "全部改动均以 v2.7.1-FIX-* 注释标注；网表验证脚本 verify_fixes.js 与交付文档同目录。"
     "原始三平台源码未做任何修改。", size=9.5, color=RGBColor(0x40, 0x40, 0x40))

h("七、融合平台建设成果", 1)
para("本节记录在评审结论基础上，以 publish 2.7.0 副本为底座所做的融合建设。"
     "全部改动仅存在于 D:\\charging_pile\\_patched\\schematicforge-2.7.0-fixed，"
     "三个原始平台源码零改动。", size=10)

h("7.1 架构决策：不重构，在副本上扩展", 2)
para("结论：不需要重构。理由如下表。", bold=True)
table(["判断依据", "结论"],
      [["publish 的 engine 单向数据流、UMD 单核、构建镜像、双 IR 反读、fail-closed 闸门与 325 个语义测试",
        "设计正确，是三家唯一的工程资产；重构会摧毁它"],
       ["与 Qwen 的冲突（sync-web 字节一致、66 类 IEC 符号、ERC 器件校验、HMAC 批准边界）",
        "均为可适配的接口约束，非架构级冲突"],
       ["本次需新增的能力（BOM 知识层、链接渲染、AI 读图证据、缺陷修复）",
        "均为加层，不触碰既有不变量"]],
      [8.0, 7.5])
para("")
para("融合配方：Qwen 供「内容列」，publish 供「信任列」。Qwen 提供 "
     "url / manual / note / 资料入口 / 需核验项 这些内容数据；publish 提供 "
     "CANDIDATE → HMAC-SHA256 → APPROVED 的信任治理；两者合成同一张 BOM，"
     "既不丢失 Qwen 的实用信息，也不绕过 publish 的批准边界。", size=10)

h("7.2 能力一：BOM 采用 Qwen 样式并支持点击跳转", 2)
bullet("新增 engine/bom-library.js：把 Qwen 的 43 条人工整理条目重新结构化为 36 条、"
       "覆盖 66/66 个 device kind（100%），零冲突、零价格泄漏。")
bullet("BOM 由 8 列扩至 12 列：信任列 8 列（型号 / 参考推荐厂家 / 说明手册下载等）+ "
       "参考知识列 4 列（型号参考 / 推荐厂家参考 / 说明 / 资料入口）。")
bullet("图面明细表新增第 4 列「厂商参考」，渲染真正的 <a href target=\"_blank\">；"
       "并登记外链配色 #2f6fb2（沿用 Qwen 已登记色）。")
bullet("新增交互式 HTML BOM（*_BOM.html）：自包含、可离线打开、链接可点击、"
       "按类别分组、信任列与参考列分区呈现。实测 42 个链接 / 20 个唯一 URL。")
bullet("数据诚实性：linkKind 区分 vendor-home（30 条，厂商官网或产品页）与 "
       "search（6 条，检索入口）；不把厂商首页伪装成型号级手册直链。", bold=True)
bullet("安全验证：非 http(s) 链接 0、缺 rel=noopener 0、缺 target=_blank 0、"
       "内联 script 0、on* 事件属性 0、未转义裸 & 0。", bold=True)

h("7.3 能力二：AI 识别原理图并给出评审意见", 2)
para("平台原本已具备基础设施：api/engineering.js 的 handleReview 支持上传 "
     "PNG / JPEG / WebP / SVG / PDF 做 advisory 审图，前端也有「AI + 知识库审图」"
     "按钮（不上传文件时审查当前生成方案）。本次补齐的是关键缺口：", size=10)
bullet("修复前 buildCase() 只含电路级事实（instances / nets / circuits），"
       "AI 看不到「图是怎么画的」—— 图幅、页数、器件摆放、走线数、跨页续接、"
       "反读审计与视觉质量结果全部缺失，所谓「AI 审图」实际只能审模型。", bold=True)
bullet("新增 drawingEvidence：逐页给出图幅/尺寸/比例、器件数/走线数/跨页续接符数、"
       "反读审计结论（pageGate.renderedGeometry）、视觉质量结论（visualQuality）、"
       "以及器件位置摘要（供判断版面可读性）。")
bullet("前端接入 state.renderedSchematicDocument，使生成图直接被审。")
bullet("实测效果：AI 现可读出「六页图幅为 A1/A2/A3 混杂」与"
       "「S04 为 0 器件 0 走线却闸门 PASS」—— 正是评审发现的两处缺陷，"
       "说明 AI 已具备真正的读图依据。", bold=True)

h("7.4 能力三：越界档位欠选（三家共病的电气安全问题）", 2)
para("实测场景：600kW，进线 1024.7A，需求 1281A，而内置接触器序列上限只有 800A。", size=10)
table(["", "修复前", "修复后"],
      [["CLI 输出", "只显示「交流进线 1024.7A / 断路器 1600A」",
        "增加「选型越界项: 交流主接触器 需求1281A/选用800A(缺口481A)」"],
       ["设备 BOM", "「800A AC-3·线圈 24VDC…」—— 看起来是正常选型",
        "追加「【档位不足：需求 1281A，内置序列上限 800A，缺口 481A，须按厂家型录另选】」"],
       ["JSON", "仅 warnings 字符串，沉在数十 MB 深处",
        "新增 selectionIntegrity 结构化记录（含 affectedRows 可定位到 BOM 行）"]],
      [3.0, 6.5, 7.5])
para("设计要点：越界事实记录在 BOM 载荷层，而不是给实例加字段。原因是 "
     "instanceFingerprint 包含所有未排除键，给实例加字段会让既有批准绑定全部失效。", size=10)

h("7.5 能力四：线号体系（三家共同最硬缺口）", 2)
para("三家平台此前都没有线号。施工查线、端子排配线、故障定位全部依赖线号，"
     "没有它图纸无法用于接线。本次以确定性派生补齐：", size=10)
bullet("线号 = 'W' + circuitId 的数字部分（CCT-0125 → W0125）。circuitId 本就是 "
       "EDEM 回路身份，因此线号与电气真值一一对应、可逆追溯，不需要独立编号表。")
bullet("图面实测：6 页共 200 个线号。")
bullet("接线表新增「线号」列，与图面标注完全一致（例如 W0002 同时出现在图上与 CSV）。")
para("实现要点（两处关键设计）：", bold=True)
bullet("线号在**编译期**注册为 IR annotation，因此自动进入 primitives，"
       "从而通过平台自身的反读审计 —— 该审计要求图面每个文字都必须在 IR 中登记，"
       "任何「图面自己画上去」的内容都会被拒绝。")
bullet("避让判定改为与 visual-quality-audit 的 segmentIntersectsBox **同口径**"
       "（导线必须严格穿过文字框内部才算碰撞），并使用审计同款字宽参数"
       "（ASCII 0.58 / 宽字符 1.0 / padding 0.6）。这一点是实测踩出来的："
       "最初用「带容差的盒子重叠」自算，结果审计判定 270 处 VIS-005 导线碰撞。")
para("实测结果：VIS-005 导线碰撞 0、VIS-004 器件碰撞 0、VIS-003 文字重叠 0，"
     "5 标准 × 4 桩型共 20 个组合的 projectGate 全部 PASS。", bold=True)
para("一处实测踩坑记录：引入线号后，eu 与 chademo 的 ac-dc-combo 组合各出现 1 处文字重叠。"
     "根因是器件位号标签（如「A1.2/4」）被画在器件外框之上或外侧，而避让时只考虑了器件 "
     "bbox，没有考虑这些标签文字。把已存在的文字 primitive 一并纳入避让障碍后归零。", size=10)

h("7.6 回归验证", 2)
table(["验证项", "结果"],
      [["完整回归（node --test 全部文件）", "325 例 / 324 通过 / 1 跳过 / 0 失败，与未修改基线完全一致"],
       ["BOM 单元测试", "10 / 10 通过（列清单改为引用接口本身，并断言信任列与参考列不重叠）"],
       ["源同步契约", "6 / 6 通过（engine 与 web/js 字节一致、bundle 可确定性重建）"],
       ["ERC / 功能安全 / loop-integrity", "29 / 29 通过（直接受急停硬线修复影响）"],
       ["知识库覆盖", "66/66 kind、0 冲突、0 价格泄漏"],
       ["端到端生成", "闸门 PASS，18 个产物（6×SVG + 6×DXF + 交互式BOM + BOM + 接线表 + RFQ + 审计 + JSON）"],
       ["原始源码保护", "三个原始平台中 'v2.7.1-FIX' 命中数均为 0"]],
      [6.5, 9.0])

h("7.7 尚未完成的部分（如实列出）", 2)
table(["项", "状态"],
      [["RS0 母线泄放电阻仍永久并接 1000V 直流母线", "已诊断；实现手段已备（dc-contactor 新增 AUX_NC/AUX_NO 辅助触点端子），接线未做"],
       ["空页判 PASS（S04 无器件仍判通过）", "已诊断，未修"],
       ["六页图幅混杂（A1/A2/A3）", "已诊断，未统一"],
       ["反读审计不防白描边隐藏走线", "已诊断，未修"],
       ["DC 侧浪涌保护缺失", "已诊断，未修"],
       ["NOT_EVALUATED 未纳入导出闸门", "已诊断，未修"]],
      [7.5, 8.0])

docx_path = os.path.join(OUT, "充电桩原理图平台_三平台评审报告_含融合成果.docx")
doc.save(docx_path)
print("已生成:", docx_path)
