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

## ⚠️ Mock 工具命名差异（与根目录规范不统一，需对齐）

根目录 `src/mock-mcp.js` 的 `MockBusinessMcpGateway` 定义了**规范工具名**（与 `contracts/mcp-openapi.yaml` 一致）：

```
search_catalog(catalog:read)        get_product_detail(catalog:read)
check_availability(inventory:read)  calculate_quote(pricing:read)
get_policy(policy:read)             get_order_status(order:read)
hold_inventory(inventory:hold,写)    release_hold(inventory:release,写)
create_order_draft(order:draft:create,写)  create_handoff(handoff:create,写)
```

而本目录 `tools/` 落地的 Mock 名为 **`catalog` / `inventory_schedule` / `quote`**（早期 `mock_*` 前缀已按方案 §5 重命名），**与上述规范名并不一致**。两套实现对接同一业务，但工具标识未对齐——这是后续合并/复用时必须统一的点（建议本目录工具名改为规范 `search_catalog` / `check_availability` / `calculate_quote` 等）。

## 已知限制（未随本包上传）

- Mock 网关运行期不可达（`host.docker.internal:18089` HTTP=000），`feasible_rate` 为本地降级估算；
- 密钥泄露事件（Worker 经 `cat` 把明文 API KEY 贴入房间）记录在 `BUG-credential-leak.md`，因含明文凭据**未纳入本仓库**，仅保留本地整改记录。
