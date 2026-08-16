# PPT 修订实施指令 —— 《Agent Infra 初赛方案 V2》

> 本指令供执行 Agent（主 Agent / 修图 Agent）照做。目标：让 PPT「当前进展」如实反映本地 Demo 已完成情况，并在多 Agent 协同设计页标注「演示版与生产目标态」的差异。
> 全部坐标/shape 索引已用 python-pptx 实测，可直接执行。

---

## 0. 目标文件

- 源文件（只读，不要改动）：
  `/Users/qichenxie/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_7ifvtmzg61ms22_f71e/temp/drag/Agent Infra初赛方案PPT V2.pptx`
- 工作副本 + 输出（写入项目内）：
  `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/docs/ppt/Agent Infra初赛方案PPT V2.pptx`
  输出另存为：`/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/docs/ppt/Agent Infra初赛方案PPT V2-已修订.pptx`

## 1. 修改范围（红线）

**只改：**
1. **第 27 页**「落地计划与当前进展」——「当前进展」2 条文字 +「未来事项」4 条文字（共 6 处替换）。
2. **第 12 / 13 / 14 / 15 页**——每页底部新增 1 行灰色小字注脚（共 4 处新增）。

**禁止改：**
- 其余 24 页任何内容；
- 第 27 页的「24 周落地计划」7 个阶段条、页首导语、「关键门禁」「落地策略」两行；
- 第 12–15 页的流程图、连线、色块、各 Worker/Leader 卡片、输出行（如「闭环 2 输出：资源锁定 + 草稿单」）与图例行（如「蓝线：任务流…」）。

## 2. 前置操作

1. 复制源文件为工作副本：
   ```bash
   cp "/Users/qichenxie/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_7ifvtmzg61ms22_f71e/temp/drag/Agent Infra初赛方案PPT V2.pptx" \
      "/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/docs/ppt/"
   ```
2. 备份：
   ```bash
   cp "/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/docs/ppt/Agent Infra初赛方案PPT V2.pptx" \
      "/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/docs/ppt/Agent Infra初赛方案PPT V2.backup.pptx"
   ```
3. 环境：`python3 -m pip install python-pptx`（若已装则跳过）。

---

## 3. 修改点 A —— 第 27 页「当前进展」（替换 2 条）

用 python-pptx 打开工作副本，`slide27 = prs.slides[26]`，按 **shape 索引** 替换文本（索引与坐标已实测，勿用文本搜索，避免命中其他页）：

| shape 索引 | 位置 | 原文 | 替换为 |
|---|---|---|---|
| 42 | 左列 top=4.05" | `• 完整生产技术方案已形成，明确了 Team、状态、流程、RAG、工具、数据与安全边界` | `• 四大核心业务场景（售前引导、支付锁档建单、人工接管、知识改进）已完成端到端原型验证，主流程已跑通` |
| 43 | 左列 top=4.47" | `• AgentTeams、MCP Gateway、Policy & Approval、RAG 与观测评测闭环的总体架构已确定` | `• 双团队架构已落地：客户服务与平台运营共 10 个智能体、12 项技能、9 个业务工具已全部就绪并完成注册` |

## 4. 修改点 B —— 第 27 页「未来事项」（替换 4 条）

| shape 索引 | 位置 | 原文 | 替换为 |
|---|---|---|---|
| 46 | 左下 top=5.04" | `• 验证 AgentTeams 外部接入方式、地域、模型配额、网络与账号权限。` | `• 接入真实商品、库存、报价与订单系统，完成第一次真实闭环验证。` |
| 47 | 左下 top=5.38" | `• 建立生产 / 预发 / 测试资源组，完成 VPC、RDS、Tair、MQ、OSS、SLS/ARMS 等底座。` | `• 搭建正式运行环境（云资源、数据库、消息队列、知识库、监控告警），为规模化做准备。` |
| 48 | 右列 top=4.12" | `• 固定 OpenAPI、MCP Schema、事件规范、SLO 与威胁模型，形成可执行基线。` | `• 逐步开通小程序、公众号等多渠道入口，上线身份识别与主动通知。` |
| 49 | 右列 top=4.51" | `• 接入真实商品、库存、报价与订单沙箱，先打通“模糊需求 → 待支付订单”闭环。` | `• 完善履约售后、人工协同工作台、知识治理与安全高可用，按计划进入试点放量。` |

**格式要求（A/B 通用）：**
- 保留原字号（10.8pt）、颜色、对齐方式与「• 」前缀；
- 若替换后文本换行溢出文本框（原框宽 5.45"），可将字号降至 10pt 或精简措辞，**不得移动 shape 位置**；
- 替换后标题「当前进展」「未来事项」两词保持不动。

## 5. 修改点 C —— 第 12–15 页新增注脚（4 处）

每页（`prs.slides[11]` / `[12]` / `[13]` / `[14]`）底部新增一个文本框：

- **位置**：left=0.42"，top=6.55"，width=11.5"，height=0.30"
- **文案**（统一）：
  `注：本页为生产目标态设计；当前演示版本中，Agent 编排经 Manager 房间调度，审批 / 网关等平台组件以 mock 内联校验实现。`
- **样式**：9pt、灰色 RGB(0x59,0x59,0x59)、左对齐、不显式设字体名（继承模板中文字体）；
- **防遮挡**：若发现与页面图形相交（尤其第 14 页中部有大型形状），将 top 下调至 7.16" 或收窄宽度至 6"，确保不与任何既有 shape 相交、不压住输出行（输出行 top≈7.02"）。

---

## 6. 技术要点（保格式替换，勿整体赋值）

```python
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

SRC = ".../docs/ppt/Agent Infra初赛方案PPT V2.pptx"
DST = ".../docs/ppt/Agent Infra初赛方案PPT V2-已修订.pptx"
prs = Presentation(SRC)

def replace_text(shape, new_text):
    """保格式替换：全文写入第一个 run，清空其余 run。禁止 shape.text_frame.text = new_text（会丢格式）。"""
    tf = shape.text_frame
    p = tf.paragraphs[0]
    if p.runs:
        p.runs[0].text = new_text
        for r in p.runs[1:]:
            r.text = ""
    else:
        p.text = new_text

s27 = prs.slides[26]
replace_text(s27.shapes[42], "• 四大核心业务场景（售前引导、支付锁档建单、人工接管、知识改进）已完成端到端原型验证，主流程已跑通")
replace_text(s27.shapes[43], "• 双团队架构已落地：客户服务与平台运营共 10 个智能体、12 项技能、9 个业务工具已全部就绪并完成注册")
replace_text(s27.shapes[46], "• 接入真实商品、库存、报价与订单系统，完成第一次真实闭环验证。")
replace_text(s27.shapes[47], "• 搭建正式运行环境（云资源、数据库、消息队列、知识库、监控告警），为规模化做准备。")
replace_text(s27.shapes[48], "• 逐步开通小程序、公众号等多渠道入口，上线身份识别与主动通知。")
replace_text(s27.shapes[49], "• 完善履约售后、人工协同工作台、知识治理与安全高可用，按计划进入试点放量。")

NOTE = "注：本页为生产目标态设计；当前演示版本中，Agent 编排经 Manager 房间调度，审批 / 网关等平台组件以 mock 内联校验实现。"
for si in (11, 12, 13, 14):          # 第 12–15 页
    slide = prs.slides[si]
    box = slide.shapes.add_textbox(Inches(0.42), Inches(6.55), Inches(11.5), Inches(0.30))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    run = p.add_run()
    run.text = NOTE
    run.font.size = Pt(9)
    run.font.color.rgb = RGBColor(0x59, 0x59, 0x59)

prs.save(DST)
print("saved:", DST)
```

> 若第 12–15 页出现遮挡（可用 `shape.left/top/width/height` 与注脚框做相交检测），按 §5 的防遮挡规则微调后重存。

---

## 7. 验收清单（全部通过才算完成）

- [ ] 第 27 页 6 处文字已替换，标题、24 周计划条、「关键门禁」「落地策略」未动；
- [ ] 第 12–15 页各新增 1 行灰字注脚，且不与图形重叠、不压住输出行与图例行；
- [ ] 除第 12/13/14/15/27 页外，其余 24 页无任何改动；
- [ ] 重新打开输出文件，中文字体、字号、配色正常，无乱码；
- [ ] 输出文件保存为 `docs/ppt/Agent Infra初赛方案PPT V2-已修订.pptx`，备份文件保留。

## 8. 交付

- 输出路径回传并确认验收清单全部勾选；
- 若任一步失败，如实回报失败点与原因，**不得静默跳过或自创替代方案**。
