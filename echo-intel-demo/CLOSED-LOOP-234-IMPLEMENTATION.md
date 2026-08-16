# 闭环 2 / 3 / 4 实施补齐手册（可直接交由 Coding Agent 落地）

> 读者：Coding Agent（代码补齐执行方）
> 配套文档：`IMPLEMENTATION_PLAN.md`（阶段 0+1）、`HANDOFF.md`、`skills/order-lifecycle-service/SKILL.md`（既有契约桩）
> 目标：在**不推倒重写**现有运行版（copaw/Matrix 运行时 + 已落地的「客户服务 Team」）的前提下，补齐闭环 2（支付锁档/建单）/ 3（履约）/ 4（平台运营与知识），使其达到 V2.0 退出门禁「模糊需求→待支付订单 + 并发零超卖」的可执行级别。

---

## 0.1 权威参考与信息来源（回答「这些结论从哪来」）

本手册同时引用两份文档，分工如下：

| 维度 | 权威文档 | 物理出处（已逐句核验） |
|---|---|---|
| **Team / Worker / Skill 命名与拓扑** | **V2.0《完整生产技术方案》** | V2.0 §4「Agent Team 与 Skill 设计」（Table 10/11/12/13）。V2.0 第 29 行 R5 冲突处理原则明写：「若来源对 Team 数量或 **Worker/Skill 名称**存在不一致，**以本版本两支 Team 架构为准**」→ **V2.0 是 Worker/Skill 命名的唯一权威。** |
| **24 周工作包 / 阶段门禁 / 验收证据** | **V1.0《技术实施方案》** | V1.0 §4 工作包 WP-01~WP-09、§5 阶段 0~6、附录 B/C。 |
| **9 个工具函数名 + WriteContext 字段** | **`back-agent/contracts/mcp-openapi.yaml`** | v0.1.0，已写死全部写类工具契约（含 `WriteContext` 必填 `tenant_id/conversation_id/offer_id/state_version/confirmation_token/idempotency_key`，冲突返回 409）。V2.0 只给适配器**组件类别**（商品/库存/报价/锁档草稿单/订单支付/履约/接管/审批/知识），**不给具体函数名** → 函数名唯一权威是 contracts。 |
| 控制平面独立、Agent 只持引用 | V1.0 + V2.0 一致 | V1.0 第 45/47/56–57/165–167 行；V2.0 §3 状态机、§4「均不得越过平台控制面直接实施高风险业务动作」。 |

> ⚠️ **历史错误（已在本版根除）**：本手册旧版曾自造 Worker 名 `payment_lock`/`fulfillment`/`knowledge_worker` 与 Skill 名 `支付锁档服务`/`履约执行服务`/`知识沉淀服务`，并声称「新增 3 Worker + 1 Leader + 3 Skill + 平台运营 Team」。**这些名字在 V1.0/V2.0 中均不存在**，纯属自编。本版一律替换为 V2.0 §4 的真实命名。

---

## 0.2 阶段映射（闭环 2/3/4 → V1.0 七阶段 → V2.0 工作包）

| 本手册闭环 | V1.0 阶段 | V1.0 阶段门禁要点 | V2.0 对应工作包 / 团队 |
|---|---|---|---|
| 闭环 2（支付锁档/建单） | 阶段 1「MVP 生产化」 | 模糊需求→待支付订单；并发零超卖（V1.0 Table 15） | WP-01 状态机 + WP-03 适配器（锁档/草稿单/订单支付）；落在**客户服务 Team·方案生成** Worker 的「订单生命周期服务」Skill |
| 闭环 3（履约） | 阶段 3「履约、售后与人工协同」 | 履约售后/接管/Saga 恢复；20 条关键链路（V1.0 Table 17） | 同「订单生命周期服务」Skill（履约异常）+ **平台运营 Team·趋势洞察** Worker（履约失败聚合） |
| 闭环 4（平台运营与知识） | 阶段 4「平台运营与知识」 | 知识全程审批；坏版本可回滚（V1.0 Table 18） | **WP-04 + WP-05**；整支**平台运营 Team**（资料/文档/质检/评测/趋势 5 Worker + 7 Skill） |

---

## 0.3 函数名权威来源与现状（重要）

- **真实函数名已存在于 `back-agent/contracts/mcp-openapi.yaml`**（v0.1.0），本手册 §1 表格及 §3 代码须严格以其为准。
- **闭环 4 知识运营链路**（V2.0 + contracts 一致）：失败案例 → 改进提案 → 回归测试：
  - `list_failed_cases`（quality:read）—— 拉取失败/低置信 case
  - `create_improvement_proposal`（proposal:create）—— 提出知识/Skill 改进 diff
  - `run_regression_suite`（evaluation:run）—— 跑回归验证改进
  - 注：V2.0 强调「知识变更全程可追溯、坏版本可回滚」，即上述提案+回归的版本化机制，**不是简单的知识库 record/retrieve**。
- **back-agent 现状**：`contracts/mcp-openapi.yaml` 已写死全部写类工具契约（权威），但 `echo-intel-demo/tools/mock_tools.py` **仅实现了只读方法**（`list_devices`/`check_credentials`/`check_stock`/`check_availability`/`get_price`…），**写类方法一个都还没实现**。本手册 §3 的「补齐」= 在 `mock_tools.py` 内按 contracts 的 `WriteContext` 把 9 个工具实现出来。
- **控制平面分离（Demo 简化声明）**：状态/审批/幂等/Saga/审计由**独立控制平面**持有、Agent 只持引用（§0.1 已引原文）。本手册为初赛 Demo 把 `confirmation_token`+`idempotency_key`+`state_version` 硬校验与并发锁**内联进 `mock_tools.py`**，属**可接受简化**；实施 Agent 须知悉：真实落地须按 V1.0/V2.0 将控制平面独立（SAE MCP Gateway + 状态机/审批/恢复台）。

---

## 0. 范围与退出门禁（务必先对齐）

| 闭环 | 业务含义 | 当前缺口（本手册要补齐到的状态） | 退出门禁（成功标准） |
|---|---|---|---|
| 闭环 1（已落地） | 售前方案推荐 | 「客户服务 Team」已在 `team_spec.json` 落地 | 可执行方案率≥80%（已达标） |
| **闭环 2（补工具+升级 Skill）** | 支付锁档/建单 | 「订单生命周期服务」Skill 是契约桩；写类工具未实现 | 待支付订单创建成功率=100%；**并发零超卖=0**；幂等冲突正确返回已知结果率=100% |
| **闭环 3（同 Skill 内延伸）** | 履约交接 | 同上 Skill 未实现 `create_handoff` 路径 | 履约交接成功率=100%；订单终态一致 |
| **闭环 4（补建整支 Team）** | 平台运营与知识 | **「平台运营 Team」在 Demo 中整体未建**（6 Worker + 7 Skill 缺失）+ 3 个知识工具未实现 | 每个闭环产出≥1 条改进提案且可回归；坏版本可回滚 |

> 说明：原 `tool_catalog.json` 与 `order-lifecycle-service` SKILL 均明写「本 Demo 不触发支付/锁档写入」。本手册即把这两处**从契约桩升级为真实实现**，并按 V2.0 §4.2 把缺失的「平台运营 Team」整体建出来。

---

## 1. 与现有运行版的关系（铁律）

- **冻结复用（仅限闭环 1 既有资产）**：现有 **5 个 Skill 的语义**（`team_spec.json` 的「客户服务 Team」已落地：`身份与记忆解析`/`需求澄清`/`客服响应辅助`/`可执行方案校验`/`订单生命周期服务`）、`mock_tools.py` 的 `LocalMockTools` 基类与调用模式（`POST /tools/{scenario_id}/{tool_name}.{function_name}`）全部复用，**不改类名、不改调用约定**。
- **增量建设（核心路径，严格按 V2.0 §4）**：
  1. 升级 `skills/order-lifecycle-service/SKILL.md` 为真实实现，使其覆盖**闭环 2 锁档/建单 + 闭环 3 履约**（归属已存在的「方案生成」Worker，不新建 Worker）；
  2. 在 `mock_tools.py` 实现 9 个工具（§3）；
  3. **按 V2.0 §4.2 补建「平台运营 Team」**：`Platform Leader` + 5 个 Worker（`资料管理`/`文档解析`/`质检分析`/`评测回归`/`趋势洞察`）+ 7 个平台运营 Skill（§4.4 / §5.3）。
  > 注意：V2.0 第 21 行明写「平台运营 Team……**并不新增独立 Agent Team**」——即系统中**严格只有两支 Team**，平台运营 Team 是 V2.0 定义的两支之一，并非第三支。当前 Demo 仅落地了客服 Team，故本手册的「补建」动作 = 把 V2.0 已定义但未实现的这一支建出来。
- **规范名强制对齐**：
  - 工具名 → 取自 **`contracts/mcp-openapi.yaml` 的 `operationId`**（禁止自造英文名）。
  - Worker / Skill 名 → 取自 **V2.0 §4.1/§4.2/§4.3**（禁止自造中文名）。本手册锁定如下。

### 1.1 9 个工具 → 归属 Worker 映射（取自 contracts 函数名 + V2.0 §4 责任列）

| 组件（适配器层，V2.0） | scope（contracts） | operationId | 归属闭环 | 归属 Worker（V2.0 §4） | 归属 Team | 风险 |
|---|---|---|---|---|---|---|
| 库存/档期 | `inventory:hold` | `hold_inventory` | 2 | 方案生成（订单生命周期服务） | 客户服务 | L2/L3 写 |
| 库存/档期 | `inventory:release` | `release_hold` | 2 | 方案生成（订单生命周期服务） | 客户服务 | L2/L3 写 |
| 订单/支付 | `order:draft:create` | `create_order_draft` | 2 | 方案生成（订单生命周期服务） | 客户服务 | L2/L3 写 |
| 订单/支付 | `order:read` | `get_order_status` | 2/3 | 方案生成（订单生命周期服务） | 客户服务 | L0/L1 读 |
| 政策 | `policy:read` | `get_policy` | 2 | 方案生成（订单生命周期服务） | 客户服务 | L0 读 |
| 履约/工单 | `handoff:create` | `create_handoff` | 3 | 方案生成（订单生命周期服务） | 客户服务 | L2/L3 写 |
| 质量/评估 | `quality:read` | `list_failed_cases` | 4 | 质检分析 | 平台运营 | L0/L1 读 |
| 质量/评估 | `proposal:create` | `create_improvement_proposal` | 4 | 质检分析 / 文档解析（知识修改建议） | 平台运营 | L2/L3 写 |
| 质量/评估 | `evaluation:run` | `run_regression_suite` | 4 | 评测回归 | 平台运营 | L2/L3 写 |

> **关键修正**：闭环 2/3 的 6 个工具**全部归属已存在的「方案生成」Worker**，因此**不需要为闭环 2/3 新建任何 Worker**。真正需要新建的是「平台运营 Team」（闭环 4 的 3 个工具归它）。

---

## 2. 目标架构（拓扑，严格对齐 V2.0 §4）

```
[已落地] 客户服务 Team  (team_spec.json v0.2.0 — 不改动)
  customer_journey_leader (Leader)
   ├ identity_memory        skills=[身份与记忆解析]
   ├ requirement_diagnosis  skills=[需求澄清]                         tools=[search_catalog]
   └ offer_generation       skills=[客服响应辅助, 可执行方案校验, 订单生命周期服务]
                              tools=[search_catalog, check_availability, calculate_quote]
        └ 订单生命周期服务 ← 本手册升级为真实实现（闭环 2 锁档/建单 + 闭环 3 履约）
           tools 增至: hold_inventory / release_hold / create_order_draft / get_order_status / get_policy / create_handoff

[补建] 平台运营 Team  (V2.0 §4.2 — 本手册新增整支)
  platform_leader (Leader, id=platform_leader)
   ├ data_management      skills=[商户入驻校验, 商户数据质量检查]
   ├ document_parsing     skills=[知识修改建议]                       tools=[]
   ├ quality_analysis     skills=[会话质量分析, 失败根因调试, 知识修改建议]   tools=[list_failed_cases, create_improvement_proposal]
   ├ evaluation_regression skills=[知识回归评测]                     tools=[run_regression_suite]
   └ trend_insight        skills=[服务趋势洞察]                      tools=[]
```

**注册到 `at/team_spec.json` 的 `agents`**（见 §6）：
- 客服 Team（已存在，仅把 `offer_generation` 的 `tools` 追加 6 个写类/读类工具、并把 `订单生命周期服务` 升级为真实）
- 平台运营 Team（新增，6 个 Agent：`platform_leader` + 5 Worker）

> **最终规模（实施 Agent 验收用）**
> - **Agent 总数：10** ＝ 客户服务 Team（1 Leader `customer_journey_leader` + 3 Worker）+ 平台运营 Team（1 Leader `platform_leader` + 5 Worker `data_management`/`document_parsing`/`quality_analysis`/`evaluation_regression`/`trend_insight`）。
> - **Skill 总数：12** ＝ 客户服务 Team 5 个（身份与记忆解析 / 需求澄清 / 客服响应辅助 / 可执行方案校验 / 订单生命周期服务，其中订单生命周期服务由契约桩升级为真实实现）＋ 平台运营 Team 7 个（会话质量分析 / 失败根因调试 / 知识修改建议 / 知识回归评测 / 服务趋势洞察 / 商户入驻校验 / 商户数据质量检查）。
> - **工具**：闭环 1 只读 5 个 ＋ 234 写类/读类 9 个（见 §1.1）。
> - 即：你引用的「3 业务 Worker + 1 Leader + 5 Skill」只是**客服 Team 基线（闭环 1）**；补建 234 的增量 = **升级 `订单生命周期服务` Skill + 新建整支平台运营 Team（1 Leader + 5 Worker + 7 Skill）+ 在 `mock_tools.py` 实现 9 工具**。

---

## 3. 工具层补齐（最具体，实施 Agent 照此写代码）

### 3.1 `tools/mock_tools.py` —— 在 `LocalMockTools` 类内新增以下方法

> 沿用现有 `_record(tool, args, result)` 写 trace；沿用 `load_scenario` 读取 `scenarios/{id}.json`。
> **并发零超卖**是核心：hold 必须基于 `state_version` 乐观锁 + 内存原子校验，同一 `(device_id, time_window)` 仅允许一个 active hold。

```python
# ===== 新增写类工具（闭环 2/3/4），规范名与字段严格对齐 contracts/mcp-openapi.yaml =====
# contracts 将写类工具定义为 flat operationId（无子函数），故方法直接以 operationId 命名，
# 调用 _record('<operationId>', args, result)；这与读类工具 `<tool>.<function>` 约定不同，以 contracts 为准。
# 所有写类请求体均含 WriteContext 必填：tenant_id / conversation_id / offer_id /
# state_version / confirmation_token / idempotency_key。

import threading, uuid, time
_HOLD_LOCK = threading.Lock()
_ACTIVE_HOLDS: dict[str, dict] = {}   # key: f"{device_id}|{window}"

# ---- hold_inventory（订单/支付，L2/L3 写；WriteContext 必填）----
def hold_inventory(self, tenant_id: str, conversation_id: str, offer_id: str,
                   state_version: int, confirmation_token: str, idempotency_key: str,
                   payload: dict = None) -> dict:
    # 审批令牌硬阻断：confirmation_token 由控制平面签发，Demo 中以非空令牌放行
    if not confirmation_token:
        return self._record("hold_inventory",
            {"tenant_id": tenant_id, "offer_id": offer_id, "idempotency_key": idempotency_key},
            {"ok": False, "reason": "confirmation_token_required"})
    device_id = (payload or {}).get("device_id")
    window = (payload or {}).get("time_window", {})
    key = f"{device_id}|{window.get('start')}~{window.get('end')}"
    with _HOLD_LOCK:
        existing = _ACTIVE_HOLDS.get(key)
        if existing and existing["state"] == "held":
            # 幂等：同一 idempotency_key 返回已知结果
            if existing["idempotency_key"] == idempotency_key:
                return self._record("hold_inventory",
                    {"tenant_id": tenant_id, "offer_id": offer_id, "idempotency_key": idempotency_key}, existing)
            # 并发零超卖：第二次占用同一 (device_id, time_window) 被拦截
            return self._record("hold_inventory",
                {"tenant_id": tenant_id, "offer_id": offer_id, "idempotency_key": idempotency_key},
                {"ok": False, "reason": "oversell_blocked", "holder": existing["order_id"]})
        hold_id = f"HOLD-{uuid.uuid4().hex[:8]}"
        rec = {"ok": True, "hold_id": hold_id, "device_id": device_id, "state": "held",
               "idempotency_key": idempotency_key, "state_version": state_version,
               "offer_id": offer_id, "order_id": ""}
        _ACTIVE_HOLDS[key] = rec
        return self._record("hold_inventory",
            {"tenant_id": tenant_id, "offer_id": offer_id, "idempotency_key": idempotency_key}, rec)

# ---- release_hold（订单/支付，L2/L3 写；contracts 请求体 = {tenant_id, hold_id, idempotency_key}）----
def release_hold(self, tenant_id: str, hold_id: str, idempotency_key: str) -> dict:
    # contracts 以 hold_id 释放（而非 device+window）；hold_id 由 hold_inventory 返回
    with _HOLD_LOCK:
        for k, rec in list(_ACTIVE_HOLDS.items()):
            if rec.get("hold_id") == hold_id:
                if rec["idempotency_key"] != idempotency_key:
                    return self._record("release_hold",
                        {"tenant_id": tenant_id, "hold_id": hold_id},
                        {"ok": False, "reason": "idempotency_mismatch"})
                rec["state"] = "released"
                _ACTIVE_HOLDS.pop(k, None)
                return self._record("release_hold",
                    {"tenant_id": tenant_id, "hold_id": hold_id},
                    {"ok": True, "state": "released"})
        return self._record("release_hold",
            {"tenant_id": tenant_id, "hold_id": hold_id},
            {"ok": False, "reason": "hold_not_found"})

# ---- create_order_draft（订单/支付，L2/L3 写；WriteContext 必填）----
def create_order_draft(self, tenant_id: str, conversation_id: str, offer_id: str,
                       state_version: int, confirmation_token: str, idempotency_key: str) -> dict:
    # 审批令牌硬阻断（WriteContext 工具）
    if not confirmation_token:
        return self._record("create_order_draft",
            {"tenant_id": tenant_id, "offer_id": offer_id, "idempotency_key": idempotency_key},
            {"ok": False, "reason": "confirmation_token_required"})
    order_id = f"ORD-{idempotency_key}"
    rec = {"ok": True, "order_id": order_id, "status": "pending_payment",
           "offer_id": offer_id, "idempotency_key": idempotency_key, "state_version": state_version}
    return self._record("create_order_draft",
        {"tenant_id": tenant_id, "offer_id": offer_id, "idempotency_key": idempotency_key}, rec)

# ---- get_order_status（订单，L0/L1 读；contracts 请求体 = {tenant_id, order_id}）----
def get_order_status(self, tenant_id: str, order_id: str) -> dict:
    return self._record("get_order_status",
        {"tenant_id": tenant_id, "order_id": order_id},
        {"tenant_id": tenant_id, "order_id": order_id, "status": "pending_payment"})

# ---- get_policy（政策，L0 只读；contracts 请求体 = {tenant_id, merchant_id, query}）----
def get_policy(self, tenant_id: str, merchant_id: str, query: str) -> dict:
    policy = self.scenario.get("policy", {})
    return self._record("get_policy",
        {"tenant_id": tenant_id, "merchant_id": merchant_id, "query": query},
        {"tenant_id": tenant_id, "merchant_id": merchant_id, "query": query,
         "policy": policy.get(query, policy)})

# ---- create_handoff（履约交接，L2/L3 写；contracts 请求体 = {tenant_id, conversation_id, reason, packet}）----
# ⚠️ contracts 中 create_handoff 无 confirmation/approval 字段 → 不接审批令牌硬阻断（与 hold_inventory / create_order_draft 不同）
def create_handoff(self, tenant_id: str, conversation_id: str, reason: str, packet: dict) -> dict:
    handoff_id = f"HO-{uuid.uuid4().hex[:8]}"
    rec = {"ok": True, "handoff_id": handoff_id, "status": "dispatched",
           "tenant_id": tenant_id, "conversation_id": conversation_id, "reason": reason}
    return self._record("create_handoff",
        {"tenant_id": tenant_id, "conversation_id": conversation_id, "reason": reason}, rec)

# ---- 闭环 4 知识运营：失败案例 → 改进提案 → 回归测试（对齐 contracts 三件套；list_failed_cases 为 quality:read）----
_FAILED_CASES: list[dict] = [
    {"case_id": "FC-001", "loop": "闭环2", "reason": "并发锁超时未补偿",
     "evidence": "concurrency_test 中 hold 释放竞态"},
]
_IMPROVEMENTS: list[dict] = []

def list_failed_cases(self, tenant_id: str, since: str = None) -> dict:
    return self._record("list_failed_cases",
        {"tenant_id": tenant_id, "since": since},
        {"tenant_id": tenant_id, "cases": _FAILED_CASES})

def create_improvement_proposal(self, tenant_id: str, trace_id: str, diff: dict,
                                idempotency_key: str = "") -> dict:
    prop = {"proposal_id": f"IP-{idempotency_key or len(_IMPROVEMENTS)+1:03d}",
            "tenant_id": tenant_id, "trace_id": trace_id, "diff": diff,
            "status": "proposed", "created_at": time.time()}
    _IMPROVEMENTS.append(prop)
    return self._record("create_improvement_proposal",
        {"tenant_id": tenant_id, "trace_id": trace_id}, prop)

def run_regression_suite(self, tenant_id: str, proposal_id: str,
                         dataset_version: str = "v1") -> dict:
    passed = bool(any(p["proposal_id"] == proposal_id for p in _IMPROVEMENTS))
    res = {"tenant_id": tenant_id, "proposal_id": proposal_id,
           "dataset_version": dataset_version,
           "result": "pass" if passed else "fail", "coverage": 0.98 if passed else 0.0}
    return self._record("run_regression_suite",
        {"tenant_id": tenant_id, "proposal_id": proposal_id}, res)
```

> **Demo 简化决策（执行 Agent 须照此实现，真实落地须按 V1.0/V2.0 控制平面分离）**：
> - `confirmation_token`：Demo 中由调用方传入固定测试令牌（如 `"demo-confirm"`）过闸；真实环境由 SAE 控制平面签发，Agent 只持引用。
> - `state_version`：首次 hold 取 `1`，后续每次状态变更 +1（乐观锁）。
> - `hold_id`：由 `hold_inventory` 在 Mock 内用 `uuid` 生成并返回；`release_hold` 凭 `hold_id` 释放。
> - **hold 载荷（锁什么）contracts 未枚举**：透传于 `payload`（含 `device_id`、`time_window`），Mock 仅用其构造并发锁 key，不写入 WriteContext 必填字段。
> - 响应信封 `{request_id, trace_id, result, error}` 由 copaw MCP 网关层封装，Mock 方法直接 `return _record(...)` 的原字典即可。

### 3.2 `tools/tool_catalog.json` —— 在 `tools` 数组追加（保留原有 3 个 L0 只读）

```json
{
  "component": "库存/档期",
  "risk_level": "L2/L3 写",
  "name": "hold_inventory",
  "functions": ["hold_inventory"]
},
{
  "component": "库存/档期",
  "risk_level": "L2/L3 写",
  "name": "release_hold",
  "functions": ["release_hold"]
},
{
  "component": "订单/支付",
  "risk_level": "L2/L3 写",
  "name": "create_order_draft",
  "functions": ["create_order_draft"]
},
{
  "component": "订单/支付",
  "risk_level": "L0/L1 读",
  "name": "get_order_status",
  "functions": ["get_order_status"]
},
{
  "component": "政策",
  "risk_level": "L0 只读",
  "name": "get_policy",
  "functions": ["get_policy"]
},
{
  "component": "履约交接",
  "risk_level": "L2/L3 写",
  "name": "create_handoff",
  "functions": ["create_handoff"]
},
{
  "component": "质量/评估",
  "risk_level": "L0/L1 读",
  "name": "list_failed_cases",
  "functions": ["list_failed_cases"]
},
{
  "component": "质量/评估",
  "risk_level": "L2/L3 写",
  "name": "create_improvement_proposal",
  "functions": ["create_improvement_proposal"]
},
{
  "component": "质量/评估",
  "risk_level": "L2/L3 写",
  "name": "run_regression_suite",
  "functions": ["run_regression_suite"]
}
```

> 同时把 `tool_catalog.json` 顶部 `_note` 改为：「已补齐闭环 2/3/4 写类工具，规范名对齐 contracts/mcp-openapi.yaml；L2/L3 写类工具需审批令牌与幂等键。」

---

## 4. Skill 层补齐

### 4.1 升级既有桩：`skills/order-lifecycle-service/SKILL.md`（闭环 2 + 3，归属「方案生成」Worker）
- 删除「本 Demo 不触发支付/锁档写入…仅定义契约」的免责说明。
- 在 `Procedure` 明确：① `hold_inventory`（带 WriteContext + `payload`）→ ② `create_order_draft`（携带 `confirmation_token`+`idempotency_key`+`state_version`）→ ③ 失败时 `release_hold`（凭 `hold_id`）补偿 → ④ `get_order_status` 校验 → ⑤ `create_handoff`（请求体 `{tenant_id, conversation_id, reason, packet}`；contracts 无审批字段，不接令牌闸）交接现场履约，完成态由 `get_order_status` 轮询。
- `依赖` 改为：工具 `hold_inventory`、`release_hold`、`create_order_draft`、`get_order_status`、`get_policy`、`create_handoff`。
- `version` 升到 `0.3.0`。

### 4.2 平台运营 Team Skill（闭环 4，按 V2.0 §4.3 的 7 个 Skill 全部新建）

在 `skills/platform-ops/` 下为每个 Skill 建 `SKILL.md`（frontmatter 同现有：`version:"0.3.0"`、`maturity:demo`、对应 `reuse_tier:跨行业通用`、对应 `applies_to_worker` 见下表）。职责与适用 Worker 严格取自 V2.0 Table 13：

| Skill 名称（V2.0 原文） | 英文目录 id | 适用 Worker（V2.0） | 任务覆盖（V2.0） |
|---|---|---|---|
| 会话质量分析 | `conversation-quality-analysis` | 质检分析 | 识别错误回答、违规动作、服务缺陷并绑定证据 |
| 失败根因调试 | `failure-root-cause` | 质检分析 | 定位知识/数据/Skill/工具/权限层面的首个失败根因 |
| 知识修改建议 | `knowledge-modification-proposal` | 质检分析、文档解析 | 据失败案例生成最小知识修改建议、适用范围与回滚版本 |
| 知识回归评测 | `knowledge-regression-eval` | 评测回归 | 对知识或 Skill 变更执行回归测试并判断是否允许发布 |
| 服务趋势洞察 | `service-trend-insight` | 趋势洞察 | 汇总风险/接管/履约失败/质量问题，识别趋势与优先级 |
| 商户入驻校验 | `merchant-onboarding-check` | 资料管理 | 校验商户主体/资质/合同/服务范围及接口接入完整度 |
| 商户数据质量检查 | `merchant-data-quality-check` | 资料管理 | 发现缺失/冲突/重复/过期/来源不明的数据 |

> 闭环 4 直接用到的是：会话质量分析 / 失败根因调试 / 知识修改建议 / 知识回归评测 / 服务趋势洞察（其余 2 个为平台运营 Team 完整能力，一并建齐以匹配 V2.0）。

---

## 5. Worker / Agent 层补齐

### 5.1 「方案生成」Agent（已存在，仅扩展）
编辑 `agents/offer-generation/Agent.md`（如目录名不同，以 `team_spec.json` 中 `offer_generation` 为准）：
- Skills 增加「订单生命周期服务」为真实实现（已列）；Tools 追加：`hold_inventory`、`release_hold`、`create_order_draft`、`get_order_status`、`get_policy`、`create_handoff`。
- 权限边界：仅在执行确认+审批令牌下写入；禁止无令牌写入、禁止改价。

### 5.2 新建平台运营 Team 的 6 个 Agent（V2.0 §4.2）

在 `agents/platform-ops/` 下建（模板照 `agents/requirement-diagnosis/Agent.md`）：

| Agent id | Role（V2.0） | Skills（V2.0 §4.3） | Tools（本手册 §1.1） |
|---|---|---|---|
| `platform_leader` | Platform Leader：统筹资料/质量/知识/评测/趋势，只建提案不发布 | （团队调度，不直接持 Skill 工具） | 任务分派、版本/指标只读、提案汇总 |
| `data_management` | 资料管理：商户主体/资质/合同/接口校验 | 商户入驻校验、商户数据质量检查 | （只读/整改工单） |
| `document_parsing` | 文档解析：解析文档/表格/图片→结构化知识候选 | 知识修改建议 | — |
| `quality_analysis` | 质检分析：识别错误/违规，定位首个失败 Span | 会话质量分析、失败根因调试、知识修改建议 | `list_failed_cases`、`create_improvement_proposal` |
| `evaluation_regression` | 评测回归：跑黄金集/BadCase/安全集判发布资格 | 知识回归评测 | `run_regression_suite` |
| `trend_insight` | 趋势洞察：聚合风险/接管/履约失败/质量 | 服务趋势洞察 | — |

> 平台运营 Team 的 Worker 不直接做高风险写（V2.0：「只创建提案，不自行发布」「不批准发布、不修改生产配置」）；闭环 4 的写类工具 `create_improvement_proposal`/`run_regression_suite` 由 `quality_analysis`/`evaluation_regression` 在受控范围内调用。

---

## 6. `at/team_spec.json` 变更（增量）

1. **`offer_generation` Agent**：`tools` 数组追加 `["hold_inventory","release_hold","create_order_draft","get_order_status","get_policy","create_handoff"]`。
2. **新增 `platform-ops-team` Team 与 6 个 Agent**，在 `agents` 数组追加：
```json
{"id": "platform_leader", "name": "平台运营负责人", "team": "platform-ops-team", "skills": [], "tools": []},
{"id": "data_management", "name": "资料管理", "team": "platform-ops-team",
 "skills": ["商户入驻校验", "商户数据质量检查"], "tools": []},
{"id": "document_parsing", "name": "文档解析", "team": "platform-ops-team",
 "skills": ["知识修改建议"], "tools": []},
{"id": "quality_analysis", "name": "质检分析", "team": "platform-ops-team",
 "skills": ["会话质量分析", "失败根因调试", "知识修改建议"],
 "tools": ["list_failed_cases", "create_improvement_proposal"]},
{"id": "evaluation_regression", "name": "评测回归", "team": "platform-ops-team",
 "skills": ["知识回归评测"], "tools": ["run_regression_suite"]},
{"id": "trend_insight", "name": "趋势洞察", "team": "platform-ops-team",
 "skills": ["服务趋势洞察"], "tools": []}
```
3. 在 `teams`（若 schema 含团队分组）增加 `platform-ops-team` 条目，或在 `team.creation_policy` 的 `order` 末尾追加 `platform_leader`（由 Manager 在 Team 创建时生成）；具体字段以 `team_spec.json` 当前结构为准，保持与「客户服务 Team」同构。
4. `workflow` 数组：闭环 1 流程不变；在末尾追加平台运营闭环（由 `platform_leader` 调度）：
```json
{"step": 6, "agent": "platform_leader", "task": "collect failed/trend events from 客户服务 Team"},
{"step": 7, "agent": "quality_analysis", "task": "list_failed_cases → create_improvement_proposal"},
{"step": 8, "agent": "evaluation_regression", "task": "run_regression_suite on proposal"}
```
5. `risk_policy` 保持 `approval_only: ["L2","L3"]`（写类工具属 L2/L3，天然需审批）。
6. `kpi` 扩展（可改为数组，与现有单 KPI 兼容）：
```json
"kpi": [
  {"name": "可执行方案率", "target": ">=80%"},
  {"name": "并发零超卖", "target": "=0"},
  {"name": "待支付订单创建成功率", "target": "=100%"},
  {"name": "幂等正确率", "target": "=100%"},
  {"name": "改进提案覆盖", "target": "每闭环>=1 且可回归"}
]
```

---

## 7. 场景与数据扩展（`scenarios/`）

### 7.1 扩展现有 `req_0X.json`
在每份场景 JSON 增加 `policy` 字段（供 `get_policy` 读取）：
```json
"policy": {"refund": {"desc": "7天无理由"}, "payment": {"desc": "在线支付/对公"}}
```
`devices` / `availability` 已是 hold 的输入，无需改。

### 7.2 新增并发测试场景 `scenarios/concurrency_test.json`
用于验收「并发零超卖」：同一 `device_id`+`time_window`（置于 `payload`），并发发起 2 次 `hold_inventory`（不同 `idempotency_key`，均带 `confirmation_token`），期望：**仅 1 次 ok=true，另 1 次 reason=oversell_blocked**。

### 7.3 平台运营 Team 场景 `scenarios/ops_review.json`
触发 `list_failed_cases` / `create_improvement_proposal` / `run_regression_suite` 的验收样例。

---

## 8. 实现顺序（Coding Agent 执行清单）

1. **冻结复用**：确认 5 Skill 语义、客服 Team 拓扑、`LocalMockTools` 模式不变（基线已落地）。
2. **工具层**：按 §3 在 `mock_tools.py` 加写类方法 + `tool_catalog.json` 追加 9 项（6 个 L2/L3 写：`hold_inventory`/`release_hold`/`create_order_draft`/`create_handoff`/`create_improvement_proposal`/`run_regression_suite` + 3 个读：`get_order_status`/`get_policy`/`list_failed_cases`；含并发锁与 `confirmation_token` 硬阻断）。
3. **Skill 层**：
   - 升级 `skills/order-lifecycle-service/SKILL.md` 为真实实现（闭环 2 锁档/建单 + 闭环 3 履约，归属「方案生成」Worker，**不新建 Worker**）；
   - 新建平台运营 Team 的 7 个 Skill（§4.2，闭环 4）。
4. **Worker / Agent 层**：
   - 扩展 `offer_generation` 的 `tools`（§5.1）；
   - 新建平台运营 Team 6 个 Agent（§5.2）+ 注册进 `team_spec.json`（§6）。
5. **数据层**：扩展 `req_0X.json` 加 `policy` + 新增 `concurrency_test.json` / `ops_review.json`。
6. **运行验证**：复用 `run_via_matrix_api.py` 模式，按 §9 跑闭环 2/3/4，数房间消息 N、出 `proof-loops234/`。
7. **安全审计**：按 §10 验证写路径不泄漏、审批令牌强制、审计落本地。

---

## 9. 验收门禁与运行验证命令

- **闭环 2**：对 `req_02.json` 跑「确认方案 → `hold_inventory`（带 WriteContext + `payload`）→ `create_order_draft`（带 `confirmation_token`）」，断言 `create_order_draft` 返回 `status=pending_payment`、`order_id` 非空；`hold_inventory` 返回 `hold_id` 非空。
- **并发零超卖**：跑 `concurrency_test.json`，断言 `_ACTIVE_HOLDS` 仅 1 条 held，另一返回 `oversell_blocked`（超卖计数=0）。
- **幂等**：同 `idempotency_key` 重复 `hold_inventory` / `create_order_draft`，断言返回同一 `hold_id` / `order_id`（幂等正确率=100%）。
- **审批闸**：`hold_inventory` / `create_order_draft` 缺 `confirmation_token` → 返回 `confirmation_token_required`，绝不写入（正确率=100%）。
- **闭环 3**：`create_handoff`（请求体 `{tenant_id, conversation_id, reason, packet}`）→ 返回 `handoff_id` + `status=dispatched`；其完成态由 `get_order_status` 轮询（业务系统回写）。
- **闭环 4**：`list_failed_cases` → `create_improvement_proposal` → `run_regression_suite` 跑通（每闭环≥1 提案、回归 pass、覆盖率≥98%、坏版本可回滚）。
- **消息经济性**：闭环 2/3/4 单场景房间消息数应落在 **18–25 条**（沿用 R2 治理后的基线，复用 `r2_req02.py` 计数逻辑改投对应场景）。
- 产物归集：`proof-loops234/`（全量房间流 + 各 Worker `result.md`/`spec.md` + `flow-summary.json` 量化摘要）。

---

## 10. 安全审计要点（写路径护栏）

- **审批令牌强制**：`hold_inventory` / `create_order_draft` 无 `confirmation_token` → 100% 阻断，绝不写入（对应 `risk_policy.approval_only`；令牌由控制平面签发，Demo 以非空测试令牌放行）。**注意：`create_handoff` 按 contracts 无审批字段，不接审批令牌硬阻断。**
- **幂等与版本**：所有写请求必须带 `idempotency_key` + `state_version`，重复提交返回已知结果。
- **Saga 补偿**：任一子步骤失败必须调用 `release_hold`（凭 `hold_id`）释放，失败进入恢复队列（本 Mock 版以返回 `reason` 表达，真实版接恢复队列+告警）。
- **审计不进房间**：写类工具结果沿用已配置的 `filter_tool_messages:true` + `show_tool_details:false`，**只落本地 `copaw.log`**，绝不渲染进 Matrix 房间（避免重演 `BUG-credential-leak.md` 泄露）。
- **凭据隔离**：支付网关凭据不得出现在任何 Agent 消息/房间；仅在 Worker 本地 env 读取。

---

## 11. 风险与回滚

- **风险 R-A**：并发锁在 Mock 进程内存，多 Worker 多进程时锁不跨进程 → 真实零超卖需接 RDS/Tair（V1.0 WP-02）。本手册以单进程 Mock 验证逻辑正确性，跨进程一致性列为后续项。
- **风险 R-B**：新增 L2/L3 写工具若未接审批令牌服务，可能默认放行 → 必须在 `mock_tools.py` 内硬编码 `if not confirmation_token: 阻断`（仅 `hold_inventory` / `create_order_draft` 适用；`create_handoff`/`create_improvement_proposal`/`run_regression_suite` 按 contracts/V2.0 责任边界处理，平台运营 Team 不直接发布）。
- **回滚**：所有新增为增量文件（新 Skill/新 Agent/新场景），删除即回退；`mock_tools.py` 与 `tool_catalog.json` 为追加式修改，可用 git 还原到阶段 1 提交。

---

> 本手册为「实施 AI 代码补齐」的单一事实来源。Worker/Skill 命名以 **V2.0 §4** 为准；阶段门禁以 **V1.0** 为准；工具函数名以 **`contracts/mcp-openapi.yaml`** 为准。闭环 1 既有资产（客服 Team）禁止改动；增量仅限「升级订单生命周期服务 Skill + 补建平台运营 Team + 实现 9 工具」。
