---
name: merchant-data-quality-check
title: 商户数据质量检查
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 平台运营
  applies_to_worker: 资料管理
---

# 商户数据质量检查

## Purpose

发现商户数据缺失、冲突、重复和过期问题。

## Procedure

1. 全量扫描商户基础与履约数据。
2. 输出异常清单与修复优先级。
3. 提交给资料管理负责人。

## Dependencies

- 工具：无

## Failure Handling

- 发现核心字段缺失时标记高优先级。

## Evaluation Threshold

- 关键质量问题未闭环率持续下降。
