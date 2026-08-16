---
name: merchant-onboarding-check
title: 商户入驻校验
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 平台运营
  applies_to_worker: 资料管理
---

# 商户入驻校验

## Purpose

校验商户主体、资质、合同与服务范围信息的有效性。

## Procedure

1. 检查主体与资质字段。
2. 验证合同与接口接入信息。
3. 输出入驻是否通过与未通过原因。

## Dependencies

- 工具：无

## Failure Handling

- 缺失信息直接阻断入驻流程。

## Evaluation Threshold

- 入驻缺失字段漏检率 = 0。
