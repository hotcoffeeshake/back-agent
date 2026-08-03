---
name: requirement-elicitation
description: 将设备租赁自然语言需求转换为可校验的结构化约束。用于新会话、需求发生变化或关键槽位缺失时；输出字段来源、置信度和最多两个澄清问题。
---

# 需求诊断

1. 只从用户消息或表单读取事实，不补造关键字段。
2. 提取 `category`、`purpose`、`quantity`、`location`、`startAt`、`endAt`、`budget`，并为每项记录 `source` 和 `confidence`。
3. 校验数量、预算和时间区间；无效值作为缺失处理并说明原因。
4. 按“影响检索范围 > 影响履约 > 影响排序”的顺序选择缺口，每轮最多追问两个。
5. 所有必填项齐全后输出 `RequirementProfile`；否则输出 `CLARIFYING`。

## 输出

```json
{"profile":{},"missing":["startAt"],"questions":[{"field":"startAt","question":"请提供开始时间。"}]}
```

不得根据 IP 猜地点，不得将预算、日期或数量设为默认值。Schema 校验失败时停止流转并返回 `INVALID_REQUIREMENT_PROFILE`。
