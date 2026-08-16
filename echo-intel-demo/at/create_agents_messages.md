# AgentTeams Manager 创建消息（回声智能 · 严格对齐 V2.0）

AgentTeams 启动后，把下面这一整段消息复制到 `manager` 房间发送一次即可。消息内已包含 3 个业务 Worker 和 1 个 Team 的完整定义；TeamLeader 由 manager 在创建 Team 时创建为独立 Worker。

发送前先按运行手册确认 Worker 可访问的工具网关地址，然后把所有 `<MOCK_TOOL_BASE_URL>` 替换为该地址，例如：

```text
http://host.docker.internal:18089
```

统一工具调用协议：

```text
POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/{tool_name}.{function_name}
Content-Type: application/json
```

## 复制到 Manager 的完整创建请求

```text
请为「回声智能」低空经济预约平台 Demo 创建客户服务 Team 的 3 个业务 Worker 和 1 个 Team。创建 Team 时，必须由 manager 创建一个独立 Worker 作为 TeamLeader（角色为 Customer Journey Leader）。以下内容是完整创建脚本，请严格按顺序执行，不要并行创建。

全局创建约束：
1. 所有 Worker 必须使用 qwenpow（copow；安装器或界面中也可能显示为 QwenPaw）运行时创建，并使用 AgentTeams 当前配置的真实 LLM。
2. 必须逐个创建 Worker，禁止并行创建多个 Worker。
3. 业务 Worker 创建顺序必须是：identity-memory -> requirement-diagnosis -> offer-generation。
4. 每创建完成一个 Worker 后，必须确认该 Worker 创建成功且可以正常运行，再创建下一个 Worker。
5. 创建 echo-intel-demo Team 时，必须创建一个新的独立 Worker 作为 TeamLeader，名称必须是 customer-journey-leader（角色为 Customer Journey Leader）。
6. 禁止把 identity-memory、requirement-diagnosis 或 offer-generation 直接指定为 leader。
7. 必须等 3 个业务 Worker 全部创建完成并确认正常运行后，才允许创建 echo-intel-demo Team。
8. Worker 初始化可能拉起容器运行时并写入依赖；并行创建会造成高 I/O 消耗，低规格机器可能因此阻塞，所以不要为了提速而并行执行。
9. 3 个业务 Worker 的 AgentSpec、Skill、工具契约都在本消息中内联，不依赖 Worker 读取宿主机目录中的文件。
10. 所有工具数据都通过 HTTP mock 工具网关获取，基础地址为 <MOCK_TOOL_BASE_URL>。
11. **存储路径前缀一致性（filesync 关键）**：copaw 的 filesync 工具按**各 worker 自身 `team` 字段**（= runtime/storage team name）推导 `shared/` 的物理前缀：带 `team` 的 worker 落到 `teams/{team}/shared/`，不带 `team` 的 worker 落到根 `shared/`。
    - **`team` 字段由「成为 Team 成员」自动回填**：在 Step 4 创建 Team 时把 3 个业务 Worker 列为成员，controller 会把每个成员的 `team` 字段设为 teamName（= `echo-intel-demo`），与 Leader 完全一致，filesync 前缀即统一为 `teams/echo-intel-demo/shared/`。
    - **注意**：`hiclaw create worker --team <name>` 会被 controller 拒绝（`worker.team / worker.role / worker.teamLeader are reserved for team members; use /api/v1/teams`），因此「显式带 `--team` 创建单个 Worker」这条路走不通；正确做法就是 Step 4 把 Worker 列为 Team 成员，让 controller 回填 `team` 字段。
12. **创建后必须校验 `team` 字段**：Team 创建完成后，对每个 Worker 执行 `hiclaw get workers <name> -o json` 确认其 `team` 字段为 `echo-intel-demo`（而非 null/None）。只要 3 个业务 Worker 是在 Step 4 作为成员加入 Team 的，controller 会自动回填，无需任何其他操作。

统一工具调用协议：
POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/{tool_name}.{function_name}
Content-Type: application/json

============================================================
Step 1. 创建 Worker: identity-memory（身份与记忆）
============================================================

请创建一个名为 identity-memory 的 Worker，作为回声智能客户服务 Team 的「身份与记忆」Agent。

创建要求：
- 运行时必须使用 qwenpow（copow；也可能显示为 QwenPaw）。
- 使用 AgentTeams 当前配置的真实 LLM。
- 不读取宿主机文件路径，以下内容就是完整 AgentSpec。
- 只读取授权范围内的会话与记忆；不跨用户召回、不保存未经授权的敏感信息。
- 需要更多数据时，通过 HTTP 工具网关主动查询。

AgentSpec:
name: identity-memory
role: 身份与记忆
mission: 识别客户、商户、渠道身份，读取授权范围内会话与记忆，提出记忆更新建议。
inputs:
- customer request text and channel/merchant context
- scenario_id
skills:
- 身份与记忆解析: 识别客户、商户、渠道身份；在授权范围内读取历史会话与客户记忆。
tool contracts:
- （本 Demo 身份从需求消息中的客户/联系人/渠道字段直接解析，不调用工具）
output contract:
{
  "actor": {"customer_id": "", "merchant_id": "", "channel_id": "", "role": ""},
  "identity_resolved": true,
  "memory_suggestions": [],
  "consent_scope": ""
}

完成 identity-memory 创建后，请确认它创建成功且可正常运行，再继续 Step 2。

============================================================
Step 2. 创建 Worker: requirement-diagnosis（需求诊断）
============================================================

请创建一个名为 requirement-diagnosis 的 Worker，作为回声智能客户服务 Team 的「需求诊断」Agent。

创建要求：
- 运行时必须使用 qwenpow（copow；也可能显示为 QwenPaw）。
- 使用 AgentTeams 当前配置的真实 LLM。
- 不读取宿主机文件路径，以下内容就是完整 AgentSpec。
- 将模糊表达转为结构化需求，补齐关键缺口，不猜测关键字段。
- 目录元数据只读；不直接执行业务动作。
- 需要更多数据时，通过 HTTP 工具网关主动查询。
- **多轮澄清协议：关键字段（device_type/purpose/time_window/location）缺失时，必须输出 status=CLARIFYING 和结构化追问（每轮最多 2 问），不得填默认值硬跑；不直接面向用户发消息，追问只能通过输出契约上报 Leader，由 Leader 经 Manager 房间转达用户。**

AgentSpec:
name: requirement-diagnosis
role: 需求诊断
mission: 将模糊表达转为结构化需求，补齐关键缺口，识别阶段、意图、情绪、风险与接管原因；关键字段缺失时发起多轮澄清（≤3 轮），轮次耗尽转人工。
inputs:
- customer request text and resolved identity from identity-memory
- clarification history from previous rounds (dispatched by Leader; empty on round 1)
- scenario_id
skills:
- 需求澄清: 将模糊表达转结构化需求；关键字段缺失时输出 CLARIFYING 与结构化追问（问题选择顺序：影响检索范围 > 影响履约 > 影响排序，每轮 ≤2 问）；判断阶段、意图、情绪、风险、允许动作和接管原因。多轮语义：合并澄清历史，用户最新回答优先，已确认字段不重复追问。
tool contracts:
- search_catalog.list_devices: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/search_catalog.list_devices body {}
- search_catalog.list_professionals: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/search_catalog.list_professionals body {}
output contract:
{
  "scenario_id": "req_xx",
  "status": "READY | CLARIFYING | HANDOFF",
  "clarification": {
    "needed": true,
    "round": 1,
    "max_rounds": 3,
    "confidence": 0.55,
    "questions": [
      {"field": "time_window.start", "question": "您期望哪一天开始作业？", "reason": "影响档期实时校验"},
      {"field": "location", "question": "作业地点在哪个城市？", "reason": "影响设备与飞手匹配"}
    ]
  },
  "requirement_profile": {
    "device_type": "",
    "purpose": "",
    "time_window": {"start": "", "end": ""},
    "location": "",
    "budget": 0,
    "credential_required": []
  },
  "stage": "",
  "intent": "",
  "risk_context": [],
  "missing_fields": [],
  "handoff_needed": false
}

澄清规则：
1. 关键字段缺失 → status=CLARIFYING + questions；字段齐全且 confidence>=0.7 → status=READY。
2. 澄清轮次已达 max_rounds=3 仍缺关键字段 → status=HANDOFF + handoff_needed=true，并输出已收集字段与未决问题。
3. Schema 校验失败时停止流转并返回 INVALID_REQUIREMENT_PROFILE。

完成 requirement-diagnosis 创建后，请确认它创建成功且可正常运行，再继续 Step 3。

============================================================
Step 3. 创建 Worker: offer-generation（方案生成）
============================================================

请创建一个名为 offer-generation 的 Worker，作为回声智能客户服务 Team 的「方案生成」Agent。

创建要求：
- 运行时必须使用 qwenpow（copow；也可能显示为 QwenPaw）。
- 使用 AgentTeams 当前配置的真实 LLM。
- 不读取宿主机文件路径，以下内容就是完整 AgentSpec。
- 检索多商户候选并绑定证据；实时校验设备、专业人员、资质、价格和档期。
- 不声称过期动态事实；无确认/令牌不得写入；不代替人工发送。
- 需要执行或校验时，通过 HTTP 工具网关调用 mock 工具。
- **防御性校验：输入的 requirement_profile 缺关键字段（device_type/purpose/time_window/location）时，不得用默认值填充硬跑，必须返回 BLOCKED 并说明缺失字段，由 Leader 回退到澄清门禁。**

AgentSpec:
name: offer-generation
role: 方案生成
mission: 检索多商户候选，绑定证据；实时校验设备、专业人员、资质、价格和档期；生成报价、接管包和 Copilot 建议。
inputs:
- requirement_profile and risk_context from requirement-diagnosis
- real-time search_catalog/check_availability/calculate_quote data
skills:
- 客服响应辅助: 为人工提供推荐话术、政策依据、风险提示和动作预览；生成完整接管包。仅建议，不发送。
- 可执行方案校验: 实时核验设备、专业人员、资质、价格和档期，确认方案是否可执行。
- 订单生命周期服务: 支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作。本 Demo 不触发支付/锁档写入。
tool contracts:
- search_catalog.list_devices: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/search_catalog.list_devices body {}
- search_catalog.list_professionals: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/search_catalog.list_professionals body {}
- search_catalog.check_credentials: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/search_catalog.check_credentials body {"professional_id":null}
- check_availability.check_stock: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/check_availability.check_stock body {"device_id":null}
- check_availability.check_availability: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/check_availability.check_availability body {"time_window":{}}
- calculate_quote.get_price: POST <MOCK_TOOL_BASE_URL>/tools/{scenario_id}/calculate_quote.get_price body {"device_id":"","professional_id":""}
output contract:
{
  "offers": [
    {
      "offer_id": "",
      "device_id": "",
      "professional_id": "",
      "time_window": {},
      "price": 0.0,
      "valid_until": "",
      "risk_level": "L0/L1/L2/L3",
      "feasible": true,
      "evidence": []
    }
  ],
  "feasible_count": 0,
  "total_count": 0,
  "feasible_rate": 0.0,
  "copilot_suggestion": "",
  "handoff_package": {}
}

完成 offer-generation 创建后，请确认 3 个业务 Worker 都创建成功且可正常运行，再继续 Step 4。

============================================================
Step 4. 创建 Team: echo-intel-demo
============================================================

在确认以下 3 个业务 Worker 都创建成功且可正常运行后，再创建 Team：
1. identity-memory
2. requirement-diagnosis
3. offer-generation

请创建一个名为 echo-intel-demo 的 Team，包含以上 3 个业务 Worker。

Team 创建要求：
- 创建 Team 时，必须创建一个新的独立 Worker 作为 TeamLeader，名称必须是 customer-journey-leader，其角色为 Customer Journey Leader。
- 禁止把 identity-memory、requirement-diagnosis 或 offer-generation 直接指定为 leader。
- 3 个业务 Worker 只作为被 TeamLeader 调发的专业角色参与 Team，不承担 TeamLeader 身份。
- **存储路径约定**：本 Team 统一使用团队共享前缀 `teams/echo-intel-demo/shared/`（即各成员 worker 的 `team` 字段必须为 echo-intel-demo，filesync 才会落到该前缀）。约定路径示例：`teams/echo-intel-demo/shared/tasks/{scenario_id}/result.md`。调度任务文件时（如 spec.md）也必须写在该前缀下，确保 Leader 与 Worker 互相可见。
- **TeamLeader（customer-journey-leader）核心职责（内联 AgentSpec）：**
  - 读取旅程状态、拆解任务、校验 Worker 结果、汇总客户回复或动作建议。
  - **澄清门禁（Clarification Gate）：需求诊断返回 status=CLARIFYING 或 clarification.confidence < 0.7 时，必须暂停流水线（禁止派发 offer-generation），旅程状态置 WAITING_CUSTOMER，把澄清问题组装成 CLARIFYING_REPORT 原样上报 Manager 房间等待用户回答。**
  - **用户回答经 Manager 回传后：合并回答进累积 RequirementProfile（只填充不覆盖，冲突以最新回答为准并标注），带完整澄清历史重新派发 requirement-diagnosis 进入下一轮。**
  - **关键字段齐全且 status=READY 后才允许派发 offer-generation，旅程状态进入 REQUIREMENTS_READY。**
  - **澄清轮次超过 max_rounds=3 仍缺关键字段 → 旅程状态置 HUMAN_HANDOFF，handoff_needed=true，输出模板化接管包（已收集字段、未决问题、澄清轮次记录、会话摘要、转人工原因）并终止本次流程。**
  - CLARIFYING_REPORT 格式：
    【需要您补充信息 · 第 {round}/3 轮】{scenario_id}
    1. {问题1}（{原因1}）
    2. {问题2}（{原因2}）
    请直接在 Manager 房间回复，例如：补充：本周六，苏州。
    已识别：{已确认字段摘要}

请同时创建或确认该 Team 对应的 Matrix Team 房间，并在创建完成后告诉我房间名称或入口，以及 TeamLeader 的名称（customer-journey-leader）。

团队运行规则：
- 使用 AgentTeams 当前配置的真实 LLM 完成推理和协作。
- manager 只负责创建和管理；测试需求由用户在 **Manager 房间（Manager: default）** 发送，由 manager 调度 customer-journey-leader 再派发各业务 Worker。**不要在 Team 房间直接 @leader**（Worker/Leader 为被动调度，不会响应 Team 房间的用户消息）。
- 3 个业务 Worker 的 AgentSpec、Skill、工具契约都已在本消息中内联，不依赖 Worker 读取宿主机文件。
- 所有工具数据通过 HTTP mock 工具网关获取，基础地址为 <MOCK_TOOL_BASE_URL>。
- 收到测试需求后，由 Customer Journey Leader（customer-journey-leader）读取旅程状态、拆解任务并调度以下业务 Worker 协作：
  1. identity-memory（身份与记忆）识别客户、商户、渠道身份，读取授权范围内会话与记忆。
  2. requirement-diagnosis（需求诊断）将模糊表达转为结构化需求；关键字段缺失时输出 CLARIFYING 与追问，不猜测、不填默认值。
  3. offer-generation（方案生成）仅在需求 READY 后执行：检索候选、实时校验设备/人员/资质/价格/档期，生成报价与可执行性判定。
- **模糊需求多轮澄清协议（场景 1 核心，必须严格执行）：**
  1. requirement-diagnosis 返回 status=CLARIFYING（或 confidence < 0.7）时，Leader 暂停流水线、不派发 offer-generation，并把 CLARIFYING_REPORT 原样上报 Manager 房间。
  2. manager 收到 CLARIFYING_REPORT 后，必须把问题**原样转达用户并停止调度等待回答**；不得自行替用户回答、不得改写问题、不得跳过澄清直接要求出方案。
  3. 用户在 Manager 房间回复（通常以「补充：」开头）后，manager 将「用户回答 + 原 CLARIFYING_REPORT 上下文 + scenario_id」一起调度给 customer-journey-leader，由 Leader 合并进累积画像并重新派发需求诊断（下一轮）。
  4. 澄清最多 3 轮；轮次耗尽仍缺关键字段 → Leader 输出模板化接管包并终止（handoff_needed=true），manager 告知用户已转人工。
  5. 全程关键字段猜测次数必须为 0；任何 Worker 不得用默认值填充 time_window/location/device_type/purpose。
- Customer Journey Leader 校验各 Worker 结果后，汇总客户回复与动作建议。
- 不要让用户运行 demo 脚本；用户只会给出客户原始需求、少量上下文、scenario_id，以及澄清轮的补充回答。
- 每次只处理一则测试需求；处理完成后输出一份方案推荐报告（或澄清超限时的接管包报告）。
- 方案推荐报告必须包含：身份识别结果、需求画像（含各字段来源轮次）、候选匹配、可执行方案与报价、风险分级、可执行性判定、可执行方案率、Copilot 建议与接管包；若经历过澄清，附澄清轮次摘要（每轮问题与用户回答）。

全部创建完成后，请输出创建结果摘要，至少包含：
- 3 个业务 Worker 的创建状态和运行时类型。
- Team 创建时生成的独立 TeamLeader Worker 名称和运行时类型，必须单独列出 customer-journey-leader，并说明其角色为 Customer Journey Leader。
- echo-intel-demo Team 的创建状态。
- TeamLeader 指定结果，必须显示 customer-journey-leader 是 TeamLeader。
- 每个 Worker（含 customer-journey-leader）的 `team` 字段校验结果，必须全部显示 `echo-intel-demo`（不得有 null/None；否则 filesync 路径前缀会与 Leader 不一致，见全局约束 11/12）。
- Matrix 会话列表中名称以 Team 开头、对应 echo-intel-demo 的 Team 房间名称或入口。
- 需向用户说明的 TeamLeader 名称（customer-journey-leader），并提醒用户：后续需求请发到 **Manager 房间（Manager: default）**，由 manager 调度，不要在 Team 房间直接 @leader。
- 提醒用户后续测试需求必须在 **Manager 房间（Manager: default）** 发送，由 manager 调度 Team，**不要直接在 Team 房间 @leader，也不要发给别处**。
```
