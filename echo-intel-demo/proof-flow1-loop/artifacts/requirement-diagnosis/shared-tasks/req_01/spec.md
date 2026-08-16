# Task: req_01 — 预约需求处理

## 需求信息

- **scenario_id**: `req_01`
- **客户**: 杭州绿田农业
- **联系人**: 王经理
- **渠道**: 官网 IM
- **需求原文**: 明天在杭州用农业无人机做 3 小时的植保作业，大概 200 亩地。

## 处理要求

请按 echo-intel-demo Team 的标准客户服务流程处理：

1. **identity-memory（身份与记忆）**：识别客户身份、调取历史会话与记忆、确认授权范围。
2. **requirement-diagnosis（需求诊断）**：解析需求画像（作业类型=植保、时长=3 小时、面积≈200 亩、地点=杭州、时间=明天），生成需求诊断。
3. **offer-generation（方案生成）**：基于诊断结果生成可执行方案与报价，输出方案推荐报告。

## 工具网关

所有工具数据通过 HTTP mock 工具网关获取：

```
POST http://host.docker.internal:18089/tools/{scenario_id}/{tool_name}.{function_name}
Content-Type: application/json
```

## 交付物

Leader 汇总后输出完整**方案推荐报告**，包含：
- 身份识别结果
- 需求画像
- 候选匹配
- 可执行方案与报价
- 风险分级
- 可执行性判定
- 可执行方案率
- Copilot 建议与接管包

完成后将结果写入 `shared/tasks/req_01/result.md`，并在 Leader Room @manager 通知。
