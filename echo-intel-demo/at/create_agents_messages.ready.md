# AgentTeams Manager 创建消息（回声智能 · 严格对齐 V2.0）

AgentTeams 启动后，把下面这一整段消息复制到 `manager` 房间发送一次即可。消息内已包含 3 个业务 Worker 和 1 个 Team 的完整定义；TeamLeader 由 manager 在创建 Team 时创建为独立 Worker。

发送前先按运行手册确认 Worker 可访问的工具网关地址，然后把所有 `http://host.docker.internal:18089` 替换为该地址，例如：

```text
http://host.docker.internal:18089
```

统一工具调用协议：

```text
POST http://host.docker.internal:18089/tools/{scenario_id}/{tool_name}.{function_name}
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
10. 所有工具数据都通过 HTTP mock 工具网关获取，基础地址为 http://host.docker.internal:18089。

统一工具调用协议：
POST http://host.docker.internal:18089/tools/{scenario_id}/{tool_name}.{function_name}
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

AgentSpec:
name: requirement-diagnosis
role: 需求诊断
mission: 将模糊表达转为结构化需求，补齐关键缺口，识别阶段、意图、情绪、风险与接管原因。
inputs:
- customer request text and resolved identity from identity-memory
- scenario_id
skills:
- 需求澄清: 将模糊表达转结构化需求；识别缺失字段并追问；判断阶段、意图、情绪、风险、允许动作和接管原因。
tool contracts:
- catalog.list_devices: POST http://host.docker.internal:18089/tools/{scenario_id}/catalog.list_devices body {}
- catalog.list_professionals: POST http://host.docker.internal:18089/tools/{scenario_id}/catalog.list_professionals body {}
output contract:
{
  "scenario_id": "req_xx",
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

AgentSpec:
name: offer-generation
role: 方案生成
mission: 检索多商户候选，绑定证据；实时校验设备、专业人员、资质、价格和档期；生成报价、接管包和 Copilot 建议。
inputs:
- requirement_profile and risk_context from requirement-diagnosis
- real-time catalog/inventory_schedule/quote data
skills:
- 客服响应辅助: 为人工提供推荐话术、政策依据、风险提示和动作预览；生成完整接管包。仅建议，不发送。
- 可执行方案校验: 实时核验设备、专业人员、资质、价格和档期，确认方案是否可执行。
- 订单生命周期服务: 支付后受控锁档、建单、幂等与失败补偿；查询订单、变更、取消、履约异常与后续动作。本 Demo 不触发支付/锁档写入。
tool contracts:
- catalog.list_devices: POST http://host.docker.internal:18089/tools/{scenario_id}/catalog.list_devices body {}
- catalog.list_professionals: POST http://host.docker.internal:18089/tools/{scenario_id}/catalog.list_professionals body {}
- catalog.check_credentials: POST http://host.docker.internal:18089/tools/{scenario_id}/catalog.check_credentials body {"professional_id":null}
- inventory_schedule.check_stock: POST http://host.docker.internal:18089/tools/{scenario_id}/inventory_schedule.check_stock body {"device_id":null}
- inventory_schedule.check_availability: POST http://host.docker.internal:18089/tools/{scenario_id}/inventory_schedule.check_availability body {"time_window":{}}
- quote.get_price: POST http://host.docker.internal:18089/tools/{scenario_id}/quote.get_price body {"device_id":"","professional_id":""}
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
- 3 个业务 Worker 只作为被 TeamLeader 调度的专业角色参与 Team，不承担 TeamLeader 身份。

请同时创建或确认该 Team 对应的 Matrix Team 房间，并在创建完成后告诉我房间名称或入口，以及需要 @ 的 team_leader_name。

团队运行规则：
- 使用 AgentTeams 当前配置的真实 LLM 完成推理和协作。
- manager 只负责创建和管理；测试需求由 echo-intel-demo 对应的 Team 房间接收，用户需要在消息开头 @<team_leader_name>，该 mention 应指向 customer-journey-leader。
- 3 个业务 Worker 的 AgentSpec、Skill、工具契约都已在本消息中内联，不依赖 Worker 读取宿主机文件。
- 所有工具数据通过 HTTP mock 工具网关获取，基础地址为 http://host.docker.internal:18089。
- 收到测试需求后，由 Customer Journey Leader（customer-journey-leader）读取旅程状态、拆解任务并调度以下业务 Worker 协作：
  1. identity-memory（身份与记忆）识别客户、商户、渠道身份，读取授权范围内会话与记忆。
  2. requirement-diagnosis（需求诊断）将模糊表达转为结构化需求，识别缺失字段、意图与风险。
  3. offer-generation（方案生成）检索候选、实时校验设备/人员/资质/价格/档期，生成报价与可执行性判定。
- Customer Journey Leader 校验各 Worker 结果后，汇总客户回复与动作建议。
- 不要让用户运行 demo 脚本；用户只会给出客户原始需求、少量上下文和 scenario_id。
- 每次只处理一则测试需求；处理完成后输出一份方案推荐报告。
- 方案推荐报告必须包含：身份识别结果、需求画像、候选匹配、可执行方案与报价、风险分级、可执行性判定、可执行方案率、Copilot 建议与接管包。

全部创建完成后，请输出创建结果摘要，至少包含：
- 3 个业务 Worker 的创建状态和运行时类型。
- Team 创建时生成的独立 TeamLeader Worker 名称和运行时类型，必须单独列出 customer-journey-leader，并说明其角色为 Customer Journey Leader。
- echo-intel-demo Team 的创建状态。
- TeamLeader 指定结果，必须显示 customer-journey-leader 是 TeamLeader。
- Matrix 会话列表中名称以 Team 开头、对应 echo-intel-demo 的 Team 房间名称或入口。
- 需要在 Team 房间中 @ 的 team_leader_name，并说明它对应 customer-journey-leader。
- 提醒用户后续测试需求必须进入 Team 房间后，通过 @<team_leader_name> 的消息发送，不要发送给 manager。
```
