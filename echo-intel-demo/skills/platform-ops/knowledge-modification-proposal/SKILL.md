---
name: knowledge-modification-proposal
title: 知识修改建议
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 平台运营
  applies_to_worker: 文档解析/质检分析
---

# 知识修改建议

## Purpose

据失败原因生成最小知识修改提案与回滚建议。

## Procedure

1. 汇总失败与根因。
2. 生成最小 diff 与影响范围。
3. 输出可执行的提案与回滚策略。

## Dependencies

- 工具：会话质量分析 / 失败根因调试

## Failure Handling

- 无可操作 diff 时返回空提案并说明原因。

## Evaluation Threshold

- 每个提案必须包含回滚策略。
