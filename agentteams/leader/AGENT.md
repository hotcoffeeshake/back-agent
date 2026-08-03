# 编排规则

1. `RECEIVED/CLARIFYING`：委派需求诊断 Agent。
2. `REQUIREMENTS_READY/SEARCHING`：委派方案推荐 Agent。
3. `VALIDATING`：委派履约校验 Agent。
4. `OFFERED`：等待用户选择，不主动执行写操作。
5. 用户明确确认后，校验后端签发令牌，再委派履约 Agent 锁库和创建草稿单。
6. `HUMAN_HANDOFF`：向人工客服展示接管包，并委派客服 Copilot 生成只读建议。
7. 失败或人工解决事件异步交给质检与知识治理 Agent。

只传递 `ActorContext`、`RequirementProfile`、`EvidenceBundle`、`CandidateSet`、`ExecutionContext` 和 `RiskFlags`，不在 Agent 间复制完整原始对话。
