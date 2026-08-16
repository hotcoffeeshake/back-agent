# echo-intel-demo（hiclaw/copaw + Matrix 变体实现）

本目录是「回声智能」的**另一套技术栈实现**，与仓库根目录的 Node + SSE + AgentTeams MVP 互为**平行变体**：

| 维度 | 根目录 MVP（Node） | 本目录（hiclaw/copaw + Matrix） |
|---|---|---|
| 编排框架 | 本地单进程 + AgentTeams | hiclaw/copaw（基于 AgentScope）+ Matrix  homeserver |
| 多智能体 | Leader + 5 Worker（同一进程） | Manager 房间被动调度 Leader → Worker（跨容器） |
| Mock 工具 | `MockBusinessMcpGateway`（见 `src/mock-mcp.js`） | `tools/`（本地 mock 实现，见下） |
| 协同通道 | HTTP/SSE | Matrix 房间 |

## 包含内容

- `agents/`：4 个 Agent 定义（requirement-diagnosis / customer-journey-leader / offer-generation / identity-memory）
- `skills/`：5 个 Skill 规范（含表格 189 级 JSON Schema，版本 0.2.0）
- `tools/`：本地 Mock 工具实现（`mock_tools.py`、`mock_tool_server.py`、`tool_catalog.json`）
- `at/`：AgentTeams 协作规范（`team_spec.json`、`create_agents_messages.md`、`send_to_manager.md`）
- `scenarios/`：10 条测试需求（req_01 ~ req_10）
- `IMPLEMENTATION_PLAN.md`：**修改后的实施档案**，含 §8 修订记录（作者 **@hotcoffeeshake**，2026-08-16）
- `AGENTLOOP-ALIGNMENT.md`：与阿里云 AgentLoop 的对齐分析

## ✅ Mock 工具命名已对齐（规范名）

根目录 `src/mock-mcp.js` 的 `MockBusinessMcpGateway` 定义了**规范工具名**（与 `contracts/mcp-openapi.yaml` 一致）：

```
search_catalog(catalog:read)        get_product_detail(catalog:read)
check_availability(inventory:read)  calculate_quote(pricing:read)
get_policy(policy:read)             get_order_status(order:read)
hold_inventory(inventory:hold,写)    release_hold(inventory:release,写)
create_order_draft(order:draft:create,写)  create_handoff(handoff:create,写)
```

本目录 `tools/` 落地的 3 个 **L0 只读** Mock 现已**对齐规范名**：`catalog` → `search_catalog`、`inventory_schedule` → `check_availability`、`quote` → `calculate_quote`（调用形态保持本变体的 `POST /tools/{scenario_id}/{tool_name}.{function_name}`，即 `search_catalog.list_devices` 等）。涉及的 `tool_catalog.json` / `mock_tools.py` / `mock_tool_server.py` / 两个 Agent 的 `## Tools` / 两个 Skill 的 `## 依赖` / `at/team_spec.json` / `at/create_agents_messages*.md` / `README.md` / `IMPLEMENTATION_PLAN.md` 均已同步改名。

> 注：规范真名集另含 7 个写类/其他工具（`get_product_detail` / `get_policy` / `get_order_status` / `hold_inventory` / `release_hold` / `create_order_draft` / `create_handoff`，以及 3 个质量/评测类），本 **L0+L1 Demo 仅实现 3 个读类工具**，其余未实现——属范围差异，非命名差异。

## 已知限制（未随本包上传）

- Mock 网关运行期不可达（`host.docker.internal:18089` HTTP=000），`feasible_rate` 为本地降级估算；
- 密钥泄露事件（Worker 经 `cat` 把明文 API KEY 贴入房间）记录在 `BUG-credential-leak.md`，因含明文凭据**未纳入本仓库**，仅保留本地整改记录。
