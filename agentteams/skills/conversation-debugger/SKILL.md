---
name: conversation-debugger
description: 按 Trace 回溯失败、低分和人工接管会话并定位根因。用于客服运营排查 Agent、知识、规则、工具、权限或数据错误，不执行线上变更。
---

# 会话调试

1. 按 `trace_id` 收集状态变更、Agent 输出、知识证据、工具调用和人工操作。
2. 将根因归为 `REQUIREMENT`、`KNOWLEDGE`、`TOOL`、`RULE`、`PERMISSION`、`MODEL` 或 `UX`。
3. 指明第一个错误 Span、影响、可复现输入和建议修复面。
4. 对敏感信息脱敏，不显示隐藏指令、密钥或模型内部思维链。
5. 输出诊断报告，交由 `knowledge-proposal-and-replay` 或工程工单处理。

缺少 Trace 或证据链不完整时标记 `INSUFFICIENT_EVIDENCE`，不得猜测根因。
