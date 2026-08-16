# 回声智能 · AgentTeams 最小可运行 Demo（严格对齐 V2.0 口径）

> 目标：把《回声智能_完整生产技术方案_V2.0》里「客户服务 Team 售前闭环」落地为与官方 Baseline（`opspilot-zero-demo`）同级别的最小可运行 Demo，用 Mock 数据库实测「可执行方案率 ≥ 80%」。
>
> **口径原则：Worker 与 Skill 的命名、职责、复用层级、规格字段、生命周期一律采用 V2.0 文档原文，不做分叉版本。** 本文档中标注「V2.0 原文」的内容直接引用自方案第 4 章（表格 74/81）、第 13 章（表格 189/192）。

---

## 一、收敛范围与对齐原则

V2.0 方案定义了**两支 Agent Team**：客户服务 Team（4 Worker + 5 Skill）与平台运营 Team（6 Worker + 9 Skill）。本 Demo 只取**客户服务 Team 的售前方案推荐闭环**（对应方案「闭环 1：需求澄清 → 证据检索与实时方案校验 → 输出多商户可执行方案」），它是「可执行方案率 ≥80%」这一成功标准直接作用的环节。

**对齐原则（不可分叉）：**

1. Worker 名称、职责、允许工具/输出、权限边界 → 采用 V2.0 表格 74 原文。
2. Skill 名称、适用 Worker、任务覆盖、复用层级/边界 → 采用 V2.0 表格 81 原文。
3. 单个 Skill 的最小规格字段（name / input-output schema / 依赖 / 失败处理 / 评测阈值）→ 采用 V2.0 表格 189。
4. Skill 生命周期（草稿→开发→评测→审批→灰度→正式→废弃/回滚）→ 采用 V2.0 表格 192；本 Demo 的 Skill 处于「草稿/开发」阶段，标注 `maturity: demo`。

**Demo 层面的唯一落地约定（不改变口径，仅补充工程标识）：** 为满足 AgentTeams 的 Worker 命名规则，V2.0 的中文角色名同时给出英文 slug（见下表「AgentTeams 标识」列）；Skill 的 `name` 字段采用 V2.0 中文原名，英文 slug 仅用于目录与文件命名。

---

## 二、客户服务 Team 结构与 Worker（V2.0 表格 74 原文）

| Worker（V2.0 原文） | AgentTeams 标识 | 职责（V2.0 原文） | 允许工具/输出 | 权限边界 |
|---|---|---|---|---|
| Customer Journey Leader | `customer-journey-leader` | 读取旅程状态、拆解任务、校验 Worker 结果、汇总客户回复或动作建议 | 状态查询、任务分派、结果校验 | 不直接交易、退款、改价或发布知识 |
| 身份与记忆 | `identity-memory` | 识别客户/商户/渠道身份，读取授权范围内会话与记忆，提出记忆更新建议 | 会员只读、授权记忆只读/提案；ActorContext | 不跨用户召回、不保存未经授权的敏感信息 |
| 需求诊断 | `requirement-diagnosis` | 将模糊表达转为结构化需求，补齐关键缺口，识别阶段、意图、情绪、风险与接管原因 | 目录元数据、规则只读；RequirementProfile/RiskContext | 不猜测关键字段、不直接执行业务动作 |
| 方案生成 | `offer-generation` | 检索多商户候选，绑定证据；实时校验设备、专业人员、资质、价格和档期；生成报价、接管包和 Copilot 建议 | RAG、实时工具只读；受控动作预览 | 不声称过期动态事实；无确认/令牌不得写入；不代替人工发送 |

> Customer Journey Leader 在 V2.0 中即客户服务 Team 的 TeamLeader。落地到 AgentTeams 时，按官方 Baseline 机制创建为**独立 TeamLeader Worker**（名称 `customer-journey-leader`），3 个业务 Worker（身份与记忆、需求诊断、方案生成）只作为被调度的专业角色，不承担 Leader 身份。

---

## 三、Skill 清单（V2.0 表格 81 原文，5 个）

| Skill（V2.0 原文） | 英文 slug | 适用 Worker | 任务覆盖（V2.0 原文） | 复用层级/边界（V2.0 原文） |
|---|---|---|---|---|
| 身份与记忆解析 | identity-memory-resolution | 身份与记忆 | 识别客户、商户、渠道身份；在授权范围内读取历史会话与客户记忆 | 渠道适配层；跨渠道身份与人工接管 |
| 需求澄清 | requirement-clarification | 需求诊断 | 将模糊表达转结构化需求；识别缺失字段并追问；判断阶段、意图、情绪、风险、允许动作和接管原因 | 跨行业通用；跨客服/售前/售后 |
| 客服响应辅助 | service-response-assist | 方案生成 | 为人工提供推荐话术、政策依据、风险提示和动作预览；生成完整接管包 | 渠道适配层；仅建议，不发送 |
| 可执行方案校验 | offer-feasibility-check | 方案生成 | 实时核验设备、专业人员、资质、价格和档期，确认方案是否可执行 | 行业适配层；租赁履约/实时供给 |
| 订单生命周期服务 | order-lifecycle-service | 方案生成 | 支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作 | 跨交易场景；交易编排/异常补偿 |

**复用层级梯度（V2.0 第 4 章口径）：** 跨行业通用 → 渠道适配层 → 行业适配层 → 跨交易场景/跨商户通用。

---

## 四、单个 Skill 规格字段（V2.0 表格 189）

每个 Skill 的 SKILL.md 必须包含以下最小信息（本项目按此展开到 `skills/*/SKILL.md`）：

| 字段 | 含义 |
|---|---|
| name | Skill 名称（V2.0 中文原名 + 英文 slug） |
| input/output schema | 输入与输出契约（JSON Schema，含 schema_version、必填、枚举） |
| 依赖 | 依赖的其它 Skill、工具、数据与权限 |
| 失败处理 | 缺字段/冲突/超时/越权/部分失败时的兜底行为 |
| 评测阈值 | 达到什么质量门槛才算通过评测 |

Skill 生命周期（V2.0 表格 192，7 阶段）：**草稿 → 开发 → 评测 → 审批 → 灰度 → 正式 → 废弃/回滚**，每阶段有完成条件。

---

## 五、最小 Demo 范围标注

| Skill | 在本 Demo 中是否触发 | 说明 |
|---|---|---|
| 需求澄清 | ✅ 触发 | 需求诊断 Worker 的核心 Skill |
| 可执行方案校验 | ✅ 触发 | 方案生成 Worker 的核心 Skill，产出可执行方案率 |
| 身份与记忆解析 | ✅ 触发（简化） | 只识别客户/渠道身份，不落地长期记忆 |
| 客服响应辅助 | ✅ 触发（低风险场景不转人工） | 生成 Copilot 建议与接管包，仅建议不发送 |
| 订单生命周期服务 | ⚠️ 口径保留、不触发写入 | 属交易闭环（支付后锁档建单），超出最小 Demo 售前范围；Skill 定义完整保留对齐 V2.0，但 Demo 不执行支付/锁档动作 |

---

## 六、可执行方案率 ≥ 80% 测试方案

- **判定口径**：方案生成 Worker 调用「可执行方案校验」Skill，经 `search_catalog.check_credentials`（资质齐全）、`check_availability.check_stock`（设备在库）、`check_availability.check_availability`（人员有档期）、`calculate_quote.get_price`（价格有效）四条件同时成立时判定 `feasible = true`。
- **可执行方案率** = 可执行方案数 ÷ 测试需求总数。
- **测试需求集**：10 条（8 可执行 + 2 不可执行），详见 `at/test_offer_rate_message.md`。8 ÷ 10 = **80%**，满足达标线。

---

## 七、目录结构

```
echo-intel-demo/
├── README.md                          # 本文件
├── at/
│   ├── create_agents_messages.md      # 可发 Manager 的完整创建请求（3 Worker + 1 Leader + 5 Skill）
│   ├── test_offer_rate_message.md     # 10 条测试需求消息
│   └── team_spec.json                 # 团队配置（对齐表格 74/81）
├── agents/                            # 4 个 Agent.md（对齐表格 74）
├── skills/                            # 5 个 SKILL.md（对齐表格 81 + 189）
└── tools/
    └── tool_catalog.json              # Mock 工具契约
```
