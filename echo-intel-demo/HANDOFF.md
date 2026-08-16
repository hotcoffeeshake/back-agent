# 回声智能 echo-intel-demo · Handoff 交付文档

> **用途**：说明截至 2026-08-16，依据《回声智能_完整生产技术方案_V2.0》与初赛方案，Demo 已经实现到哪一阶段、是否契合 GOAI AI Infra 黑客松要求、实现清单（checklist），以及本轮排障/优化过程中得出的关键结论。
>
> **作者 / 维护**：@hotcoffeeshake ｜ 日期：2026-08-16
> **技术栈**：hiclaw / copaw（基于 AgentScope） + Matrix 房间（`127.0.0.1:18080`，tuwunel 本地实例）
> **对应仓库**：`back-agent/echo-intel-demo/`（PR #10，分支 `feat/echo-intel-demo-hiclaw-copaw`）

---

## 0. 一页纸摘要（给接手人 / 评审）

- **实现了什么**：回声智能「闭环 1 · 售前方案推荐」的最小可运行样板——4 个 Agent（3 Worker + 1 Customer Journey Leader）+ 5 个 Skill + 3 个 L0 只读 Mock 工具 + 10 条测试需求（scenarios），已在本地 Matrix 上跑通单场景（req_01）端到端闭环。
- **对齐到哪个阶段**：严格对齐 V2.0 表格 206 的 **阶段 0（Team 接入验证，仅客户服务 Team 一支） + 阶段 1（客户服务 Team 核心 Worker/Skill 的 mock 级最小样板）**，等价于大纲 Roadmap 的 **初赛 V0.2（可演示）**。
- **是否契合 GOAI 要求**：8 条比赛要求中 **6 条已满足 / 部分满足，2 条存在合规缺口**（RAG 向量检索层未独立实现、可观测/审计为本地兜底未上阿里云云产品）。详见第 2 节。
- **重要结论**：根目录 MVP（单进程）与本目录（hiclaw/copaw+Matrix）是**同一个 AgentTeams 框架的两种运行时形态，框架语义等效**；Mock 真名已与仓库 `MockBusinessMcpGateway` 对齐；房间消息噪音（804 条）与密钥泄露根因已定位并配置层治理，但仍有遗留项待收口。

---

## 1. 当前实现阶段定位（对照实施方案）

### 1.1 阶段划分来源

| 文档 | 阶段口径 | 本 Demo 落点 |
|---|---|---|
| V2.0 表格 206（24 周计划） | 阶段 0 架构与云基础（W1–W2）/ 阶段 1 MVP 生产化（W3–W6） | 阶段 0 的"Team 接入验证" + 阶段 1 的"客户服务 Team 核心 Worker/Skill（mock 级）" |
| 大纲 Roadmap | 初赛 V0.2（可演示）→ 复赛 V0.5（可验证）→ 开放计划（可复用） | **初赛 V0.2（可演示）**；复赛 V0.5（接 AgentLoop / 真实云）未启动 |
| IMPLEMENTATION_PLAN §4 | 阶段 0 / 阶段 1 逐条对齐表 | 见下方勾选 |

### 1.2 阶段 0 / 阶段 1 落地状态

| 文档原文（表格 206） | 落地情况 | 状态 |
|---|---|---|
| 阶段 0：资源、网络 | AgentTeams 本机部署（Docker，Matrix 18080 / copaw） | ✅ |
| 阶段 0：Schema | 4 个 Agent.md + 5 个 SKILL.md（含 input/output schema） | ✅ |
| 阶段 0：SLO、威胁模型 | 不覆盖（完整生产目标，mock 样板按第 17 章本地承载） | ⚪ 范围外 |
| 阶段 0：两支 Team 接入验证 | 仅验证"客户服务 Team"，平台运营 Team 属阶段 4 | ⚠️ 部分（1/2 Team）|
| 阶段 1：核心 Worker/Skill | 3 Worker（身份与记忆 / 需求诊断 / 方案生成）+ Leader + 5 Skill，严格对齐表格 74/81 | ✅ |
| 阶段 1：RDS/Tair、MCP Gateway、审批令牌、真实沙箱 | 以本地 Mock 替代（第 17 章允许） | ⚪ 替代 |
| 阶段 1：退出门禁（待支付订单 / 并发零超卖） | 仅验证到"可执行方案"（闭环 1 止于方案），不验证支付锁档 | ⚠️ 部分（止于方案）|

### 1.3 结论

> **当前实现 = 初赛 V0.2 可演示级别**，完整覆盖闭环 1（身份与记忆 → 需求诊断 → 方案生成 → Leader 校验输出可执行方案 → 止于方案）。闭环 2（支付锁档）/ 3（履约）/ 4（平台运营与知识）未实现，真实云基础设施（RDS/Tair/真实 MCP Gateway/AgentLoop）未接入，均按 V2.0 既定节奏属后续阶段，非删减。

---

## 2. GOAI 黑客松要求逐条合规评估

依据 `back-agent/GOAI AI Infra 回声智能 初赛稿件.md` 第 1 节「比赛要求摘要」8 条 + 大纲评分维度。

| # | 比赛要求 | 本实现情况 | 判定 |
|---|---|---|---|
| 1 | 智能客服自主闭环：多渠道会话聚合→意图识别分级→方案生成执行→结果核验确认→复盘沉淀 | 闭环 1 跑通（身份/记忆→需求澄清→方案生成→Leader 校验→止于方案）。多 Agent 闭环成立；复盘沉淀（闭环 5）未做 | ✅ 部分（闭环 1 满足，闭环 2/5 未含）|
| 2 | ≥3 个不同职能 Agent + 阿里云 AgentTeams 为协同基点；说明角色编排/任务拆解/上下文传递/协同执行/状态追踪 | 4 Agent（3 Worker + 1 Leader），基于 AgentTeams 运行时（hiclaw/copaw+Matrix）；角色/拆解/传递/协同有文档；状态追踪靠本地 proof + copaw.log（手工） | ✅ 满足（状态追踪偏手工）|
| 3 | 可复用 Skills 资产：输入输出/调用条件/依赖/失败处理/复用价值 | 5 Skill 均含正式 JSON Schema（schema_version/required/enum）+ 依赖 + 失败处理 + 评测阈值 + 复用价值，对齐表格 189 | ✅ 满足 |
| 4 | 工具：必要性/接口契约/可替换性/权限边界/闭环数据 | 3 个 L0 只读 Mock（search_catalog/check_availability/calculate_quote），tool_catalog.json 契约 + scope 边界 + Mock 可替换真实；**但运行期网关不可达（HTTP=000），闭环数据为假数据降级估算** | ⚠️ 部分（契约齐，运行未真连）|
| 5 | 采用 RAG：上下文增强，4 项能力至少落地 2 项 | 已落地「上下文增强」（身份与记忆解析/偏好历史）；「证据检索」以结构化 Mock 工具替代向量检索（功能等价闭环 1，但**非独立向量 RAG 层**）；知识沉淀（闭环 5）未做 | ⚠️ 部分（满足 ≥2 项的宽松口径，但缺向量检索层）|
| 6 | 可观测和可审计：Trace/Log/Metrics（阿里云云产品） | 初赛兜底：本地 copaw.log + proof-flow1-loop/（全量消息流+各 agent result/spec+审计日志，已脱敏）；**未上阿里云 AgentLoop/SLS 等云产品**（属复赛 V0.5 目标） | ⚠️ 部分（有 Trace/Log 证据，未用云产品）|
| 7 | 说明工具契约、上下文机制、验证证据、迁移成本 | tool_catalog.json + team_spec.json + proof 量化摘要 + VARIANT.md（与仓库规范名对齐及迁移说明）均有 | ✅ 满足 |
| 8 | 高风险动作须人工审批、权限控制、回滚、审计 | 设计有 L0–L3 风险分级 + file_guard + 高风险动作"止于方案"（不建单/不支付）；但实测 **file_guard 不拦 shell `cat`，曾泄露明文凭据** | ⚠️ 部分（设计满足，实现有漏洞）|

### 2.1 评分维度对照（大纲 PPT 框架，占比）

| 章节 | 占比 | 覆盖情况 |
|---|---|---|
| 第一章 场景与价值 | 25% | ✅ 场景定义明确（多商户服务电商、闭环 1 售前方案）|
| 第三章 多 Agent 协同设计 | 25% | ✅ 4 Agent 分工/拆解/上下文/状态 有文档；异常/高风险边界有设计 |
| 第四章 Skill 工程体系 | 25% | ✅ 5 Skill 完整规格（Schema/依赖/失败/安全/评估），本赛题必选项 |
| 第五章 工程落地、运行验证与安全可审计 | 20% | ⚠️ 运行证据有（proof），但 AgentLoop 云产品/向量 RAG 未上 |
| 第六章 开放/开源 | 5% | ✅ VARIANT.md 标注可复用与迁移成本 |

### 2.2 合规总判定

> **整体契合度：达标（可进入初赛评审），但存在 2 类需主动披露的缺口**——① RAG 为结构化 Mock 替代、缺独立向量检索层；② 可观测/审计为本地兜底、未上阿里云云产品。**两个缺口均在方案允许节奏内（复赛 V0.5 补齐），且初赛不强制运行代码**。建议 PPT 中明确标注"初赛以本地 Mock/本地审计兜底，复赛接入 AgentLoop 与真实云"，把缺口转化为路线图叙事而非扣分项。

---

## 3. 实现 Checklist（按模块）

### 3.1 多 Agent 协同（要求 #2）
- [x] 至少 3 个不同职能 Agent（实际 4：identity-memory / requirement-diagnosis / offer-generation / customer-journey-leader）
- [x] 基于阿里云 AgentTeams 运行时（hiclaw/copaw + Matrix = AgentTeams 的"容器·Matrix/TeamHarness·多Runtime"形态）
- [x] 角色编排文档（各 Agent.md 的 Identity/职责/输入输出/权限）
- [x] 任务拆解（Manager→Leader→Worker 被动调度链）
- [x] 上下文传递（Matrix 房间消息 + 共享需求/方案状态）
- [x] 协同执行（req_01 端到端跑通）
- [~] 状态追踪（本地 proof + copaw.log，非平台化看板）
- [x] Agent Teams 协作模式已回填正确（发 Manager 房间被动调度，见 team_spec.json / send_to_manager.md）

### 3.2 Skill 工程体系（要求 #3，本赛题必选项）
- [x] 5 个 Skill：identity-memory-resolution / requirement-clarification / service-response-assist / offer-feasibility-check / order-lifecycle-service
- [x] 每个 Skill 含 input/output 正式 JSON Schema（schema_version/required/enum）
- [x] 调用条件、依赖工具、失败处理、评测阈值、复用价值齐备
- [x] 版本管理（元数据 version 0.2.0，含历史 0.1.0）
- [~] 生命周期管理（有版本，但无发布/回滚流水线，属工程增强）

### 3.3 工具与数据集成（要求 #4 / #7）
- [x] 3 个 L0 只读 Mock 工具：search_catalog / check_availability / calculate_quote
- [x] 工具名已对齐仓库根目录 `MockBusinessMcpGateway` 规范真名（VARIANT.md 记录）
- [x] 接口契约（tool_catalog.json + 与 contracts/mcp-openapi.yaml 同业务域）
- [x] 权限边界（scope：catalog:read / inventory:read / pricing:read）
- [x] 可替换性（Mock 与真实接入共用同一 Schema 口径）
- [ ] **运行期工具网关可达**（host.docker.internal:18089 实测 HTTP=000，当前为本地降级估算）

### 3.4 RAG / 上下文增强（要求 #5）
- [x] 上下文增强：身份与记忆解析（历史偏好/交易/档案/会话记忆）
- [x] 证据检索：方案生成调用工具查库存/资质/价格（结构化，功能等价闭环 1）
- [ ] 独立向量 RAG 检索层（无 pgvector / 向量库，知识以结构化 Mock 承载）
- [ ] 知识沉淀/复盘（闭环 5 未实现）

### 3.5 可观测与安全可审计（要求 #6 / #8 高风险）
- [x] Trace/Log/Metrics 本地落地（copaw.log + proof-flow1-loop/ 全量消息流 + 各 agent result/spec）
- [x] 审计/协同分离（配置层 show_tool_details:false + filter_tool_messages:true，工具/文件同步不渲染进房间）
- [x] L0–L3 风险分级 + 高风险动作"止于方案"（不建单/不支付）
- [x] file_guard 启用（拦截 read_file 类读取凭据）
- [ ] **云产品可观测**（AgentLoop/SLS 未接，属复赛 V0.5）
- [ ] **file_guard 未拦 shell `cat`**（曾泄露明文凭据，见 BUG-credential-leak.md）
- [ ] **凭据事件 redact**（tuwunel 接口 404，6 条明文事件待手动 redact）

### 3.6 闭环覆盖（要求 #1）
- [x] 闭环 1：身份与记忆 → 需求诊断 → 方案生成 → Leader 校验 → 止于方案（req_01 跑通，feasible_rate 100%）
- [ ] 闭环 2：支付锁档 / 待支付订单 / 并发零超卖
- [ ] 闭环 3：履约执行
- [ ] 闭环 4：平台运营与知识沉淀

### 3.7 交付物齐备度（初赛要求）
- [x] 作品简介（500 字内，初赛稿件已起草）
- [x] 方案 PPT（大纲已逐页解读，待填充）
- [~] AgentTeams 代码包（已上传 PR #10，含运行入口/配置/样例，但含凭据文件已排除、运行证据 proof 已排除）
- [x] 实现设计方案（IMPLEMENTATION_PLAN.md + Agent.md）
- [x] 核心 Skill 规格（5 个 SKILL.md）
- [x] 工具与数据集成设计（tool_catalog.json + VARIANT.md）
- [~] PRD（需求澄清流程有 scenarios，独立 PRD 文档待补）

---

## 4. 重要结论汇总（本轮排障/优化得出）

### 4.1 编排框架等效性（回应"两套框架是否不同"）
- **根目录 MVP（本地单进程 + AgentTeams）** 与 **本目录（hiclaw/copaw + Matrix）** 是**同一个 AgentTeams 框架的两种运行时形态，框架语义等效**。
- 证据：PDF《AgentTeams 多 Agent 协作与统一管理底座》封面即定义核心架构 =「容器 · Matrix / TeamHarness · 多 Runtime」，且"Human、Manager、Team Leader、Worker 都是 Matrix 用户，在同一房间围绕任务协同"；Runtime Adapter 列举 Python·AgentScope / Node.js / Rust，hiclaw/copaw 即基于 AgentScope 的 Runtime。
- 差异点：根 MVP 把 AgentTeams 蓝图**塌缩成单进程同步状态机**（`EchoService` 直 `new` Agent、共享内存）；本目录是 PDF 描述的**分布式 Matrix/TeamHarness 原貌（异步消息传递、每 agent 一份 config）**。两者工具名/skill/权限边界同源。
- 运行时拓扑差异（单进程 vs 分布式 Matrix）属 AgentTeams 官方支持的多形态之一，评审不会认为是"换了框架"。

### 4.2 Mock 工具真名对齐
- 仓库根目录 `src/mock-mcp.js` 的类 **`MockBusinessMcpGateway`** 即 Mock 真名，10 个规范工具（含 scope）+ 3 个质量/评测类（list_failed_cases / create_improvement_proposal / run_regression_suite），与 `contracts/mcp-openapi.yaml` 一致。
- 本目录 `tools/` 已把早期 `catalog/inventory_schedule/quote` 对齐为规范名 **search_catalog / check_availability / calculate_quote**（L0 只读，对应 catalog:read / inventory:read / pricing:read）。规范集另有 7 个写类工具（hold_inventory / create_order_draft / create_handoff 等）超出 L0+L1 Demo 范围未实现。

### 4.3 房间消息噪音根因与治理
- 闭环 1 单场景 req_01 产生 **804 条房间消息**，互斥分类：TOOL 322(40%) / FILESYNC 223(27%) / COORD 120(14%) / PROGRESS 48(5%) / OTHER 39(4%) / SECURITY 37(4%) / DELIVERABLE 15(1%)；68% 为噪音。
- 根因：`show_tool_details:true` + `filter_tool_messages:false` 把工具调用/结果/文件同步全量渲染进房间，房间被当 stdout/审计通道。
- 治理：5 个 agent config 置 `show_tool_details:false` + `filter_tool_messages:true` + 启 `file_guard` + AGENTS.md 追加"消息经济性政策"；理论可压到 18–25 条/场景（复赛接 AgentLoop 后可平台化验证）。

### 4.4 安全事件（凭据泄露）
- Worker 曾把明文 API KEY（`cat` agent.json / mc config）广播进 Team 房间（6 条 RAW 事件），工单 `BUG-credential-leak.md` 已记录。
- 根因：不是缺 prompt 规则（AGENTS.md 已有禁读凭据），而是 `show_tool_details:true` 把 `cat` 输出渲染进房间；`file_guard` 只拦 `read_file`、拦不住 shell `cat`。
- 状态：配置层已治理（不再渲染）；但 6 条历史明文事件因 tuwunel 非标准 redact 端点（404）未自动 redact，需手动在 Element 处理；建议密钥轮换。

### 4.5 Agent Teams 协作模式（已回填）
- 真实可跑路径 = **发 Manager 房间 → Manager 被动调度 customer-journey-leader → Leader 调度各 Worker**；Team 房间 @leader 无响应。
- 文档曾写反（"Team 房间 @leader"），已在 `team_spec.json` / `create_agents_messages.md` 回填正确机制（任务 #15）。

### 4.6 工具网关不可达（量化可信度 caveat）
- mock 网关 `host.docker.internal:18089` 运行期 `HTTP=000`，feasible_rate（req_01 标注 100%）是**本地降级估算**，非真实数据校验。恢复网关后需在线复核，且 req_02~req_10 的 804→N 定量验证尚未执行。

### 4.7 filesync 存储路径前缀不一致（req_11 第 3 次踩坑）
- **现象**：Leader 汇总报告 `result.md` 落到 `teams/echo-intel-demo/shared/tasks/{id}/`，而约定/人工核查路径是根 `shared/tasks/{id}/`，导致"报告未落到约定路径"（req_01 / req_02 / req_11 三次复现）。
- **根因（已用 mc + controller API 实证）**：copaw `filesync` 工具按**各 worker 自身资源的 `team` 字段**推导 `shared/` 物理前缀——
  - `team` 非空 → `teams/{team}/shared/`（`_get_shared_remote`：`team_id` 存在时返回 `teams/{team_id}/shared/`）；
  - `team` 为空 → 根 `shared/`。
  - 实测 `customer-journey-leader` 的 `team=echo-intel-demo`（创建时带 `--role team_leader --team`），而 3 个业务 Worker（identity-memory / requirement-diagnosis / offer-generation）的 `team=None`（创建时未带 `--team`）。故 Worker 写根 `shared/`、Leader 读/写 `teams/echo-intel-demo/shared/`，前缀永远对不上。
  - 该 `team` 字段是**创建期产物**：`hiclaw get teams` 在团队层面已正确列出 3 个成员，但单个 worker 资源 `team` 仍为 null；`PATCH /api/v1/workers/<name>` 返回 405、`PUT /api/v1/teams/<name>` 仅管理成员关系不回填该字段，因此运行中无法热改，需重建 worker。
- **约定路径**：本 Team 统一用 `teams/echo-intel-demo/shared/tasks/{id}/`（团队共享前缀），所有任务文件（spec.md / result.md）均在此前缀下交换，详见 `create_agents_messages.md` 全局约束 11/12。
- **已修复（防复发，非热修）**：`create_agents_messages.md` 已强制 3 个业务 Worker 创建时显式带 `--team echo-intel-demo` 且创建后校验 `hiclaw get workers <name>` 的 `team` 字段非空；`team_spec.json` 同步标注 `shared_prefix: teams/echo-intel-demo/shared`。
- **运行时热修（需重建，见 §5 R7 / 下方命令）**：当前运行中的 3 个 Worker `team=None` 仍需重建为带 `--team` 才能消除前缀分叉；即时报告可由人工 `mc cp` 同步两个前缀兜底（req_11 已手动同步）。

---

## 5. 已知风险与遗留项

| ID | 风险/遗留 | 影响 | 建议处理 |
|---|---|---|---|
| R1 | file_guard 不拦 shell `cat`，明文凭据曾泄露 | 安全扣分项 | 加 shell/exec 级 guard 或密钥轮换；手动 redact 6 条历史事件 |
| R2 | mock 工具网关 HTTP=000，feasible_rate 为降级估算 | 量化证据可信度 | 修复网关连通或明确标注"估算"；跑 req_02~10 做现场定量 |
| R3 | RAG 缺独立向量检索层 | 要求 #5 严苛口径缺口 | 补 pgvector / 向量库，或 PPT 明确"结构化 Mock 替代、复赛接向量" |
| R4 | 可观测/审计为本地兜底，未上阿里云云产品 | 要求 #6 严苛口径缺口 | 复赛 V0.5 接 AgentLoop（官方兼容 HiClaw/AgentScope，零改造）|
| R5 | 闭环仅 1/4，止于方案未到支付锁档 | 要求 #1 范围 | 复赛补闭环 2/3/4；当前初赛仅需闭环 1 样板 |
| R6 | proof-flow1-loop / BUG-credential-leak / run_via_matrix_api 含明文，已排除未上传 | 仓库安全 | 保持排除；如需仓库内审计证据用脱敏副本 |
| R7 | 运行中 3 个业务 Worker `team=None`，filesync 前缀与 Leader 不一致（根 `shared/` vs `teams/echo-intel-demo/shared/`）| 汇总报告落到错误前缀（第 3 次）| **运行时热修**：用 manager 权限重建 3 个 Worker 显式带 `--team echo-intel-demo`（命令见下）；或人工 `mc cp` 同步两前缀兜底 |

#### 5.1 运行时热修命令：filesync 路径前缀（R7）

> 前置：`hiclaw` CLI 在 manager 容器内有团队写权限（worker 自身 token 改团队会被 403）。以下命令在 `hiclaw-manager` 容器内执行。

```bash
# 1) 删除 3 个 team=None 的业务 Worker（保留 Team 与 Leader）
for w in identity-memory requirement-diagnosis offer-generation; do
  hiclaw delete worker $w --force
done

# 2) 用显式 --team 重建（确保单个 worker 资源 team 字段 = echo-intel-demo）
#    注：实际重建需复用 create_agents_messages.md 中各 Worker 的完整 AgentSpec / Skill / 工具契约。
#    最简校验版（仅回填 team 字段，不含业务 spec）：
hiclaw create worker --name identity-memory       --team echo-intel-demo --runtime copaw
hiclaw create worker --name requirement-diagnosis --team echo-intel-demo --runtime copaw
hiclaw create worker --name offer-generation      --team echo-intel-demo --runtime copaw

# 3) 校验：4 个 agent 的 team 字段应全部为 echo-intel-demo
for w in identity-memory requirement-diagnosis offer-generation customer-journey-leader; do
  hiclaw get workers $w -o json | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['name'],'-> team=',d.get('team'))"
done

# 4) 兜底：把约定路径报告同步到两个前缀（避免人工核查遗漏）
mc cp hiclaw/hiclaw-storage/shared/tasks/req_11/result.md \
      hiclaw/hiclaw-storage/teams/echo-intel-demo/shared/tasks/req_11/result.md
```

> 要点：仅靠 `hiclaw update team` / `PUT /api/v1/teams/<name>` **不会**回填单个 worker 的 `team` 字段（实测 405/仅管成员关系）；该字段是创建期写入，必须 `--team` 重建。重建后 filesync 全队统一 `teams/echo-intel-demo/shared/`，与 §4.7 约定路径一致。

---

## 6. 下一步建议（按优先级）

1. **收口安全（高优先）**：密钥轮换 + 手动 redact 6 条明文事件 + 评估 shell 级 guard。
2. **补定量证据（高优先，评审加分）**：跑 req_02（或单条），实测优化后房间消息从 804 压到 18–25 区间，坐实配置治理收益。
3. **RAG 与云可观测（复赛路径）**：复赛 V0.5 接 AgentLoop（Trace/Log/Metrics 平台化）+ 视情况补向量检索层。
4. **闭环拓展（复赛路径）**：补闭环 2 支付锁档 / 并发零超卖，对齐阶段 1 退出门禁。
5. **文档补强**：独立 PRD V0.1、方案 PPT 填充（用大纲逐页框架 + 本 handoff 合规判定）。

---

## 7. 文件地图（接手人导航）

```
echo-intel-demo/
├── HANDOFF.md                # 本文件
├── IMPLEMENTATION_PLAN.md    # 实施阶段定义 + §7 可观测审计 + §8 修订记录(@hotcoffeeshake)
├── README.md                 # Worker/Skill 对齐表格 74/81、判定口径
├── AGENTLOOP-ALIGNMENT.md    # AgentLoop 对齐分析（复赛目标）
├── VARIANT.md                # 本变体与根目录 MockBusinessMcpGateway 命名差异说明（已对齐）
├── agents/                   # 4 Agent（3 Worker + 1 Leader）定义
├── skills/                   # 5 Skill（含表格 189 级 JSON Schema 0.2.0）
├── tools/                    # Mock 实现（tool_catalog.json / mock_tools.py / mock_tool_server.py）
├── at/                       # AgentTeams 协作规范（team_spec.json / *_messages.md / send_to_manager.md）
├── scenarios/                # 10 条测试需求（req_01~req_10）
├── BUG-credential-leak.md    # 凭据泄露工单（含明文，本地/未上传）
├── proof-flow1-loop/         # 闭环 1 量化证据（含明文，本地/未上传）
└── run_via_matrix_api.py     # Matrix API 脚本（含 token，本地/未上传）

back-agent/echo-intel-demo/   # 上述"可公开"子集的仓库副本（PR #10，已排除含凭据文件）
```

> **外部权威参考**：
> - 阿里云 AgentTeams 产品概述：https://help.aliyun.com/zh/agentteams/magic-console-product-overview
> - GOAI 初赛稿件：`back-agent/GOAI AI Infra 回声智能 初赛稿件.md`
> - PPT 框架大纲：`Agent Infra初赛方案PPT框架解读大纲.md`
> - AgentTeams 底座 PDF：`/Users/qichenxie/Desktop/AgentTeams：多 Agent 协作与统一管理底座.pdf`
> - 飞书赛道解读：https://gxyo924nvbq.feishu.cn/wiki/XfhEwGHtMixfYyk3EBncWjn7nug
