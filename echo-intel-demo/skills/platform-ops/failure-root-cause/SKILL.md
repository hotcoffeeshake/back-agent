---
name: failure-root-cause
title: 失败根因调试
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 跨行业通用
  applies_to_worker: 质检分析
---

# 失败根因调试

## Purpose

定位知识/数据/Skill/工具/权限层面的首个失败根因。

## Procedure

1. 基于会话质量分析输出构建失败链。
2. 按优先级定位最先触发失败节点。
3. 输出最小化修复建议。

## Output Contract

失败案例、优先级、建议动作。

## Dependencies

- 工具：会话质量分析结果

## Failure Handling

- 无法定位时返回 `no_root_cause`，保留观察项。
