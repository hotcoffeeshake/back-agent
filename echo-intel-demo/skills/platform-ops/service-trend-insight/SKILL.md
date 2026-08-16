---
name: service-trend-insight
title: 服务趋势洞察
metadata:
  version: "0.3.0"
  maturity: demo
  reuse_tier: 平台运营
  applies_to_worker: 趋势洞察
---

# 服务趋势洞察

## Purpose

聚合趋势、风险与失效率，输出优先级与指标。

## Procedure

1. 汇总失败、接管、履约异常与超卖事件。
2. 识别波动趋势与反常点。
3. 输出优先级清单。

## Dependencies

- 工具：无

## Failure Handling

- 数据不足时输出 `need_more_data`。

## Evaluation Threshold

- 趋势结论与业务指标一致。
