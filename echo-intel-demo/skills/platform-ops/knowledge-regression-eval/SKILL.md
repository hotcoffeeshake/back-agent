---
name: knowledge-regression-eval
title: 知识回归评测
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 平台运营
  applies_to_worker: 评测回归
---

# 知识回归评测

## Purpose

在提案更新前后执行回归验证，输出可发布建议。

## Procedure

1. 读取改动提案与数据集版本。
2. 调用回归套件；生成 pass/fail 与覆盖率。
3. 输出是否可灰度发布。

## Dependencies

- 工具：run_regression_suite

## Failure Handling

- 回归失败需返回 fail 与风险块信息。

## Evaluation Threshold

- 回归通过率 >= 98%，并支持回滚。
