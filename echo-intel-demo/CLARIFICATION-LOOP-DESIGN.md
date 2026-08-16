# 多轮澄清闭环（Human-in-the-Loop Clarification Loop）架构设计

> 版本：v1.0（2026-08-16）
> 对齐基线：《回声智能_完整生产技术方案_V2.0》场景 1（闭环 1：客户进线 → 身份与记忆解析 → **需求澄清** → 证据检索与实时方案校验 → Journey Leader 校验并输出多商户可执行方案）
> 解决问题：模糊需求下 Agent 不向用户提问、按猜测执行，导致方案不可用或字段被编造。

---

## 1. 问题陈述

当前 Demo 链路（req_01–req_10 实测）中，需求诊断 Worker 的「需求澄清」Skill 声明了"识别缺失字段并追问"，但整条链路**没有把问题送达用户的通道**：

1. Worker 是被动调度，只认识 Leader 下发的 spec，没有面向用户的通信工具；
2. Leader 的调度流程是固定流水线（身份 → 需求 → 方案 → 汇总），没有"暂停等待用户"的状态；
3. 用户唯一入口是 Manager 房间，但 manager 的调度规则里没有"转达澄清问题并等待回复"的协议。

结果：需求诊断遇到关键字段缺失时只能硬着头皮猜测（违反 V2.0"不猜测关键字段"红线）或输出残缺画像继续跑流水线。

## 2. 设计目标（对齐 V2.0）

| V2.0 原文 | 本设计的落点 |
|---|---|
| Conversation 状态机 `OPEN → CLARIFYING → WAITING_CUSTOMER / HUMAN_HANDOFF → CLOSED` | Leader 维护 journey 状态，澄清期停在 `WAITING_CUSTOMER` |
| 需求澄清 Skill："识别缺失字段并**追问**" | Worker 输出契约新增 `status=CLARIFYING` + `clarification.questions` |
| "不猜测关键字段、不直接执行业务动作" | 置信度门禁 + 澄清门禁双重强制 |
| "证据不足、超出授权、低置信或客户要求时必须转人工" | 超过澄清轮次上限 → `handoff_needed=true` + 模板化接管包 |
| 降级顺序："模型限流/延迟异常：降级到模板化澄清与接管包" | 轮次耗尽与异常共用接管包出口 |

## 3. 架构：ask_clarification 升级链路

```
用户（Manager 房间，唯一入口）
  │ ① 模糊需求（如 req_11）
  ▼
Manager ──② 调度──▶ customer-journey-leader（Journey 状态机持有者）
                        │ ③ 派发 spec（含澄清历史）
                        ▼
                  requirement-diagnosis（需求澄清 Skill）
                        │ ④ status=CLARIFYING + clarification.questions
                        ▼
                  Leader 澄清门禁（Clarification Gate）
                        │ ⑤ 置信度 < 0.7 或关键字段缺失 → 暂停流水线
                        │    不派发 offer-generation；journey → WAITING_CUSTOMER
                        │ ⑥ CLARIFYING_REPORT 原样上报 Manager
                        ▼
Manager ──⑦ 原样转达用户并等待──▶ 用户
                        ▲
用户 ⑧ 在 Manager 房间回答（"补充：xxx"）
  │ ⑨ Manager 将回答 + 澄清上下文再调度 Leader
  ▼
Leader 合并回答进累积 RequirementProfile ──▶ 重新派发需求诊断（下一轮）
  │
  ├─ 关键字段齐全（confidence ≥ 0.7）→ 继续派发 offer-generation → 汇总报告
  └─ round > max_rounds(3) → handoff_needed=true + 模板化接管包 → 终止
```

**角色职责矩阵：**

| 角色 | 澄清职责 | 禁止事项 |
|---|---|---|
| requirement-diagnosis | 输出 CLARIFYING + 每轮最多 2 个结构化问题（field/question/reason） | 直接面向用户发消息；猜测关键字段 |
| customer-journey-leader | 澄清门禁：暂停流水线、维护轮次计数、合并用户回答、超限转接管 | 关键字段缺失时仍派发 offer-generation |
| offer-generation | 防御性校验：requirement_profile 缺关键字段时返回 BLOCKED 而非硬跑 | 用默认值填充缺失字段 |
| Manager | 唯一用户通道：CLARIFYING_REPORT 原样转达、等待、带上下文回传 | 自行替用户回答；改写问题 |

## 4. 关键契约变更

### 4.1 requirement-diagnosis 输出契约（v2）

```json
{
  "scenario_id": "req_xx",
  "status": "READY | CLARIFYING | HANDOFF",
  "clarification": {
    "needed": true,
    "round": 1,
    "max_rounds": 3,
    "confidence": 0.55,
    "questions": [
      {"field": "time_window.start", "question": "您期望哪一天开始作业？", "reason": "影响档期校验"}
    ]
  },
  "requirement_profile": { "...": "已确认字段；缺失项留空字符串，不得填默认值" },
  "missing_fields": ["time_window", "location"],
  "handoff_needed": false
}
```

- `status=CLARIFYING`：存在关键字段缺失（device_type / purpose / time_window / location）且未达轮次上限。
- 问题选择顺序（继承 requirement-elicitation Skill）：**影响检索范围 > 影响履约 > 影响排序**。
- 每轮最多 2 问，避免拷问用户；轮次计数由 Leader 维护并随 spec 下发。

### 4.2 Leader 澄清门禁规则（写进 Agent.md 调度流程）

1. 校验需求诊断结果：`status != READY` 时**禁止**派发 offer-generation。
2. journey 状态：`DISCOVER → CLARIFYING → WAITING_CUSTOMER`（等待用户）→ 回答后回 `CLARIFYING` 重新诊断 → 齐全后 `REQUIREMENTS_READY`。
3. 合并语义：用户回答只**填充**累积画像，不覆盖已确认字段；冲突时以最新回答为准并在报告中标注。
4. 超限出口：`round > 3` → `status=HANDOFF`、`handoff_needed=true`，输出模板化接管包（含已收集字段、未决问题、会话摘要），流程终止。
5. 澄清问题必须经 Manager 房间原样转达（CLARIFYING_REPORT 格式），Leader 不得在 Team 房间直接回答用户。

### 4.3 CLARIFYING_REPORT（Leader → Manager → 用户的消息格式）

```text
【需要您补充信息 · 第 1/3 轮】req_11
1. 您期望哪一天开始作业？（影响档期实时校验）
2. 作业地点在哪个城市？（影响设备与飞手匹配）
请直接在 Manager 房间回复，例如：补充：本周六，苏州。
已识别：测绘无人机 / 地形勘测 / 正射影像
```

## 5. 状态机（Demo 侧 Journey 扩展）

```
DISCOVER ─▶ CLARIFYING ─⇄(多轮，≤3)─▶ WAITING_CUSTOMER
                │ round>3
                ▼
           HUMAN_HANDOFF（模板化接管包，流程终止）
                │ 字段齐全
                ▼
        REQUIREMENTS_READY ─▶ OFFER_DRAFT ─▶ ...（原流程不变）
```

## 6. 测试场景：req_11（故意模糊）

- 需求原文只有设备类型与用途，**缺时间窗、缺地点**；
- mock 目录返回空候选（无 devices / professionals），确保系统无法靠目录猜测；
- 验收标准：
  1. 第 1 轮必须收到 CLARIFYING_REPORT（含 ≤2 个问题），而非直接出方案报告；
  2. 用户回答"补充：本周六，苏州"后，流程继续并产出含实时档期校验的方案报告；
  3. 全程关键字段猜测次数 = 0；
  4. 故意连续 3 轮答非所问 → 第 4 轮前输出接管包终止。

## 7. 与生产版（V2.0 全量）的差异

| 本 Demo | 生产版 |
|---|---|
| Manager 房间人工充当用户通道 | Channel Hub / Conversation Orchestrator 驱动 `WAITING_CUSTOMER` 状态与渠道幂等事件 |
| Leader 提示词内实现门禁 | SAE 确定性控制平面实现 Clarification Gate（策略代码而非提示词） |
| 轮次计数在 Leader 上下文 | Tair/RDS 持久化 journey 状态与澄清轮次 |
| 模板化接管包文本 | handoff.created 事件 + 人工客服工作台接管队列 |

Demo 验证的是**协议与提示词层**的可行性；生产化时把门禁从提示词下沉到控制平面即可，角色契约（本文件 §3/§4）保持不变。

## 8. 实测教训（2026-08-16，req_11 复测）

实测发现：**门禁只写在 Leader 提示词里不可靠**——requirement-diagnosis 已正确输出 `status=CLARIFYING`，但 Leader LLM 仍跳过门禁派发了 offer-generation（用假设画像硬跑出报价），Manager 最后把 CLARIFYING_REPORT 埋在「处理完成」报告底部，用户端感知为「识别到模糊问题但没有多轮澄清」。

已落地的加固（提示词层，配合 §3 架构）：

1. **Manager 增加澄清门禁协议（硬性）**：分阶段派发（先 identity-memory + requirement-diagnosis），发现 status=CLARIFYING 时**立即**把 CLARIFYING_REPORT 原样转达用户、状态置 `WAITING_CUSTOMER`、**禁止**宣称「处理完成」或输出假设报价；用户回答后带上下文回传 Leader 进入下一轮。
2. **Leader 增加 HARD RULE**：推进 DAG 每一步先校验 requirement-diagnosis 的 status 字段；`!= READY` 禁止创建/派发 offer-generation，CLARIFYING_REPORT 必须单独上报 Manager 房间，不得埋在最终报告里。
3. **offer-generation 增加防御性 BLOCKED**：输入缺关键字段即返回 BLOCKED，不得用假设值硬跑。
4. **requirement-diagnosis 输出契约升级 v2**：明确 `status` / `clarification.questions`（每轮 ≤2 问）。

> 提示词层加固能显著提高 Demo 表现，但**仍非确定性保证**；验收标准（§6）若要求 100% 拦截，需按生产版下沉到控制平面（Manager 侧在派发 offer-generation 前做确定性状态校验）。
