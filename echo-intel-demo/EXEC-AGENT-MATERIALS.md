# 执行 Agent 物料清单（闭环 2 / 3 / 4 补齐）

> 用途：把这份清单 + 下列文件一并交给 Coding Agent，即可开工补齐 echo-intel-demo 的
> 闭环 2（支付锁档/建单）、闭环 3（履约）、闭环 4（平台运营与知识沉淀）。
> 总纲是 `CLOSED-LOOP-234-IMPLEMENTATION.md`，其余文件按「角色」分级。

---

## 0. 一句话目标

在不改动闭环 1 已有逻辑的前提下，补齐 9 个写类/读类 MCP 工具的实现，并按 V2.0 §4
的真实命名把「平台运营 Team」建起来、把闭环 4 知识链路接上；闭环 2/3 的锁档/建单/履约
复用已存在的「方案生成」Worker 的「订单生命周期服务」Skill，**不新建 Worker**。

---

## 1. 必交物料（按角色分级）

| # | 文件（绝对路径） | 角色 / 权威级别 | 用法 | 可改？ |
|---|---|---|---|---|
| 1 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/CLOSED-LOOP-234-IMPLEMENTATION.md` | 全局执行总纲（唯一） | 照 §3→§11 顺序落地 | 只读（除非发现与 contracts/文档冲突，先回报） |
| 2 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/back-agent/contracts/mcp-openapi.yaml` | **工具函数名 + WriteContext 必填字段 + 响应信封的唯一权威** | §3 工具代码、§1.1 映射以它为最终裁判 | 只读 |
| 3 | `/Users/qichenxie/.../...drag/回声智能_技术实施方案_V1.0_1.docx` | 24 周工作包 / 阶段门禁权威 | §0.2 阶段映射来源 | 只读 |
| 4 | `/Users/qichenxie/.../...drag/回声智能_完整生产技术方案_V2.0_1.docx` | **Team / Worker / Skill 命名与拓扑权威**（V2.0 自明「名称不一致以本版本两支 Team 为准」） | §2/§4.2/§5.2 命名来源 | 只读 |
| 5 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/at/team_spec.json` | 现有拓扑基线（1 Leader + 3 Worker + 5 Skill），待增量注册平台运营 Team | §6 增量变更 | **可改** |
| 6 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/tools/mock_tools.py` | `LocalMockTools` 基类，写类方法当前**未实现** | §3.1 补齐 9 个方法 | **可改** |
| 7 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/tools/tool_catalog.json` | 工具→scenario 映射，缺 9 个写类条目 | §3.2 追加 | **可改** |
| 8 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/skills/` | 现有 5 个客服 Skill；需升级 `order-lifecycle-service` 桩 + 新建 7 个平台运营 Skill | §4 | **可改** |
| 9 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/agents/` | 现有 4 个 Agent（1 Leader + 3 Worker）；需扩展 `offer-generation` + 新建 6 个平台运营 Agent | §5 | **可改** |
| 10 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/run_via_matrix_api.py` | 触发脚本（发需求到 Manager 房间），含凭据变量 `USER/PASS/BASE` | 验收时触发 R2 | 参考，通常不改 |
| 11 | `/Users/qichenxie/WorkBuddy/AI Infra黑客松/echo-intel-demo/at/send_to_manager.md` | **真实调度机制**：需求发到 **Manager: default 房间、不要 @ 任何人、不要发 Team 房间** | 验收触发依据 | 只读 |

> ⚠️ **关于 docx 路径（#3/#4）**：两份文档当前在微信临时目录
> `.../xwechat_files/wxid_7ifvtmzg61ms22_f71e/temp/drag/`，可能随微信清理失效。
> 手册已将其结论蒸馏进 §0.1/§0.2/§0.3，Agent 优先以手册为准；若需逐字核对，
> 请先将 docx 复制到项目内 `docs/` 再引用，并在清单里更新路径。

> **关于仓库结构**：工作仓库 = 顶层 `echo-intel-demo/`（含手册、触发脚本、可改代码）。
> 兄弟目录 `back-agent/` 是上游仓库克隆，其 `contracts/` 是工具名权威（#2）；
> `back-agent/echo-intel-demo/` 为旧变体，**不要**把它当工作副本修改。

---

## 2. 四个待拍板的未决点（先按 Demo 约定实现，接口留好）

1. **`confirmation_token` 签发**：Demo 用固定测试令牌过闸（如 `"demo-confirm"`）；
   真实由 SAE 控制平面签发，Agent 只持引用。实现时把取值做成可注入。
2. **`state_version` 起点**：首次调用 = 1，后续每次 +1 递增。
3. **`hold_id` 生成**：mock 用 `uuid` 生成并返回；真实由控制平面返回后透传。
4. **写类结果提交落点**：mock 由 `_record` 直接 `return result`；真实落 SAE 控制平面。
   提交动作封装在 `_record`，便于切换。

---

## 3. 执行顺序（摘要，详见手册 §8）

1. **工具层**（§3）→ 2. **Skill 层**（§4）→ 3. **Agent 层**（§5）→
4. **team_spec 增量**（§6）→ 5. **场景数据**（§7）→ 6. **验收**（§9）→
7. **安全审计**（§10）→ 8. **风险与回滚**（§11）

---

## 4. 验收基线（§9）

- 工具通道：9 个工具调用返回正常；`hold_inventory` / `create_order_draft` 无 `confirmation_token`
  → 100% 阻断；`create_handoff` 按 contracts 无审批字段，不阻断。
- 闭环 2/3 走通：模糊需求 → 受控锁档 → 建单 → 履约异常可被平台运营 Team 趋势洞察聚合。
- 闭环 4 走通：失败用例 → 质检根因 → 最小 Diff 提案 → 评测回归 → 人工审批 → 灰度/回滚。
- 现场定量：804 基线房间消息数；治理目标 N = 18–25（R2 实测 `req_02` 苏州勘测院需求）。

---

## 5. 红线（不可破）

- **不得新增 V2.0 不存在的 Worker/Skill 名称**。历史上编过的
  `payment_lock` / `fulfillment` / `knowledge_worker` / `platform-ops-leader` 及
  中文「支付锁档服务 / 履约执行服务 / 知识沉淀服务」**全部作废**。
- 闭环 2/3 **不新建 Worker**，复用「方案生成」的「订单生命周期服务」Skill。
- 平台运营 Team 严格按 V2.0 §4.2 = **Platform Leader + 5 Worker（资料/文档/质检/评测/趋势）**，
  闭环 4 Skill 严格按 V2.0 §4.3 = **7 个**。
- 最终规模：**2 Team = 客服(1L+3W) + 平台运营(1L+5W) = 10 Agent；12 Skill（5+7）**。

---

## 6. 冲突处理原则（Agent 遇到分歧时）

| 冲突类型 | 以谁为准 |
|---|---|
| 工具函数名 / 请求体字段 / 响应信封 | `contracts/mcp-openapi.yaml` |
| Worker / Skill 命名 / 拓扑 | V2.0 §4 |
| 工作包 / 阶段门禁 | V1.0 |
| 仍无法判定 | **停下回报，不要自己编** |

---

## 7. 交付前自检（Agent 完成后）

- [ ] §3.1 的 9 个方法名与 `contracts` 的 flat operationId 完全一致（无 `.function` 子函数写法）
- [ ] 所有写类请求体含 WriteContext 6 必填：`tenant_id / conversation_id / offer_id / state_version / confirmation_token / idempotency_key`
- [ ] `skills/` 下 `order-lifecycle-service` 已升级为真实实现；7 个平台运营 Skill 已建
- [ ] `agents/` 下 `offer-generation` 已扩展；6 个平台运营 Agent 已建
- [ ] `at/team_spec.json` 已增量注册平台运营 Team 且 JSON 合法
- [ ] grep 旧自编名（`payment_lock`/`fulfillment`/`knowledge_worker`/三个中文 Skill 名）结果为 0
- [ ] 触发 R2（`run_via_matrix_api.py`）后房间消息数落入 18–25
