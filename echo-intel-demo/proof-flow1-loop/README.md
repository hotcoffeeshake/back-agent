# 流程一（预约需求处理）闭环跑通证明

> 项目：echo-intel-demo / 回声智能 AgentTeams 多智能体编排
> 证明生成时间：2026-08-16
> 结论：**PASS — 单场景 req_01 已端到端闭环跑通**

---

## 1. 跑通结论与关键指标

| 指标 | 值 |
|------|-----|
| 闭环状态 | ✅ PASS（单场景端到端跑通） |
| 跑通场景数 | **1 个**（req_01：杭州绿田农业植保作业预约） |
| 子任务节点 | 3 个：身份识别 → 需求诊断 → 方案报价 |
| 节点验收 | **3/3 通过** |
| **可执行方案率** | **2/2 = 100%**（方案 A 双机组 + 方案 B 单机组均可执行） |
| 推荐方案 | 方案 A：2×30L 中效双机组并联，中值 **2,500 元**（≈12.5 元/亩），风险 L1 |
| 房间消息总量 | **804 条**（4 个 agent 协同） |
| 时间窗口 | 2026-08-15 19:39 ~ 20:16 UTC（北京时间 03:39 ~ 04:16，约 **37 分钟**） |
| 参与智能体 | manager / customer-journey-leader / identity-memory / requirement-diagnosis / offer-generation |

> 关于"对话轮次"：本次为 **1 个业务大循环**（req_01），Leader 将其拆为 3 个子任务迭代执行；
> 804 条消息是 4 个 agent 的工具调用与协同汇报（每个 `execute_shell_command`/`read_file`/`message`/`taskflow` 都会以消息形式进房间），并非 804 轮人工对话。

---

## 2. 可追溯性（是 / 三层证据）

整个流程**完全可追溯**，证据由三层构成：

1. **协同层（Matrix 房间全量消息流）**：`room-flow/team-room-messages.json` + `.txt`
   —— 804 条消息按时间正序，含发送者、事件 ID、内容（凭据已自动脱敏）。
2. **产物层（各 agent 交付物）**：`artifacts/<agent>/shared-tasks/.../result.md` + `spec.md`
   —— 每个子任务的输入（spec）与输出（result）均落盘，含身份识别结果、需求画像、候选方案与报价、风险分级。
3. **审计层（运行日志与对话）**：`audit-logs/<agent>.copaw.log` + `.chats.json`
   —— copaw 框架运行日志 + agent 自身对话记录，可回溯每一步工具调用。

三层证据互相印证：房间消息 → 调度子任务 → 产物 result.md → 日志回溯，形成完整闭环证据链。

---

## 3. 审计声明（务必如实告知评审）

- **⚠️ Mock 工具网关不可达**：运行期 `host.docker.internal:18089`（设备/人员/库存/价格网关）返回
  `HTTP=000 Connection refused`。因此报告中的设备参数、报价、服务商匹配（merchant_id）均为**本地降级估算**，
  **非真实数据校验结果**。`req_01/result.md` 已明确声明"网关恢复后必须在线校验替换"。
  → 即：**流程链路已验证跑通，但方案率的"数据真实性"依赖网关恢复后的在线复核。**
- **安全事件**：运行期 Worker 曾将明文凭据（`cat agent.json` / `mc config`）广播至房间，
  已记录待修复工单 `echo-intel-demo/BUG-credential-leak.md`；房间内 6 条明文事件待 redact
  （当前 redact 接口返回 404，见工单"Redact 待解决"）；agent 侧已确认整改。
  → 证明文件夹内**所有凭据均已自动脱敏**，不含明文。

---

## 4. 文件夹结构

```
proof-flow1-loop/
├── README.md                # 本说明
├── flow-summary.json        # 量化摘要（机器可读）
├── artifacts/               # 产物层（各 agent 交付物，已脱敏）
│   ├── customer-journey-leader/   # Leader 编排结果（含 req_01 总报告）
│   ├── requirement-diagnosis/     # 需求诊断节点
│   ├── offer-generation/          # 方案报价节点
│   └── identity-memory/           # 身份识别节点
├── audit-logs/              # 审计层（copaw 运行日志 + 对话，已脱敏）
└── room-flow/               # 协同层（Matrix 房间全量消息，已脱敏）
    ├── team-room-messages.json
    └── team-room-messages.txt
```

## 5. 证据链索引（关键文件）

| 环节 | 文件 |
|------|------|
| 闭环总报告（含可执行方案率 100%） | `artifacts/customer-journey-leader/shared-tasks/req_01/result.md` |
| 身份识别结果 | `artifacts/requirement-diagnosis/shared-tasks/req01-plant-protection-20260815-200110-01/result.md` |
| 需求诊断结果 | `artifacts/.../req01-...-02/result.md` |
| 方案报价结果 | `artifacts/.../req01-...-03/result.md` |
| 全量协同消息 | `room-flow/team-room-messages.txt` |
| 安全事件工单 | `echo-intel-demo/BUG-credential-leak.md`（上一级目录） |

---

*本证明文件夹由自动化脚本生成，所有 api_key / access_token / secretKey 等凭据在导出与落盘时
均经正则脱敏（替换为 `[REDACTED]` / `[REDACTED-TOKEN]`），可安全提交与归档。*
