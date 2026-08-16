---
name: conversation-quality-analysis
title: 会话质量分析
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 跨行业通用
  applies_to_worker: 质检分析
---

# 会话质量分析

## Purpose

识别错误回答、违规动作与服务缺陷，绑定证据与证据来源。

## Procedure

1. 读取会话与订单执行证据。
2. 标记错漏、偏差与合规风险。
3. 输出可落地问题清单。

## Input Schema（JSON Schema, schema_version: 1.0）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "schema_version": "1.0",
  "type": "object",
  "properties": {
    "session_events": {"type": "array", "items": {"type": "object"}},
    "handoff_events": {"type": "array", "items": {"type": "object"}}
  }
}
```

## Output Contract

- 失败案例清单、风险类别、证据摘要。

## Dependencies

- 工具：无（读取事件与日志输入）

## Failure Handling

- 日志缺失标记为 data_gap 并降置信输出。

## Evaluation Threshold

- 关键违规未检出率 = 0。
