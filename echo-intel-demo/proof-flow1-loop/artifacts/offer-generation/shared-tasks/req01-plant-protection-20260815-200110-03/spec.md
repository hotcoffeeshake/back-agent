# 任务：可执行方案与报价生成（offer-generation）

## 背景

echo-intel-demo Team 正在处理预约需求 req_01（杭州绿田农业/王经理/官网 IM）。上游已完成：
- 节点 01 身份识别（已验收）：customer_id=CUST-HZ-LVT-001，客户=杭州绿田农业，联系人=王经理，渠道=官网IM（CH-WEB-IM），角色=customer，新客户/首次接触，授权范围=仅本次预约需求处理
- 节点 02 需求画像与诊断（已验收）：植保作业、面积≈200亩、时长=3小时（窗口偏紧，建议 2 台中效机组或 1 台高效机组）、地点=杭州、时间=2026-08-16（明天）、客户类型=农业企业；模糊点=具体时段/精确位置/预算/资质/作物类型；可执行性=可行（有条件）；数据来源=全部本地降级分析（工具网关 host.docker.internal:18089 不可达）

## 执行要求

1. 可参考上游结果：
   - shared/tasks/req01-plant-protection-20260815-200110-01/result.md
   - shared/tasks/req01-plant-protection-20260815-200110-02/result.md（及 workspace/requirement-diagnosis-result.md）
2. 生成可执行方案：无人机配置（机型/数量/架次/效率）、作业排期（2026-08-16 时段建议）、药剂与作业参数、人员与设备清单、风险与应急预案。
3. 生成报价：按市场参考价给出方案报价（含单价明细、总价、计费方式），标注报价假设与浮动范围。
4. 匹配服务商/merchant：基于身份识别与需求画像，给出候选服务商匹配建议（merchant_id 可标注为待定/推荐）。
5. 工具网关提示：网关 http://host.docker.internal:18089 当前不可达（Connection refused）。若你的环节需要在线数据（如服务商资源、库存、实时价格），请按『网关不可达时的降级处理』执行：使用本地规则/知识库完成方案与报价，网关恢复后再补数据校验。请在结果中标注哪些数据来自在线工具、哪些来自本地降级。
6. 安全提醒：不得在聊天中发布任何配置文件、凭据或密钥；配置查看只允许本地文件系统操作。

## 预期结果

在 shared/tasks/req01-plant-protection-20260815-200110-03/ 下产出方案与报价结果（如 workspace/offer-generation-result.md），并发布 result.md，包含：
- STATUS: SUCCESS（或 SUCCESS_WITH_NOTES / BLOCKED / REVISION_NEEDED）
- SUMMARY: 方案与报价摘要
- DELIVERABLES: 产出文件路径（位于 shared/tasks/req01-plant-protection-20260815-200110-03/ 下，用相对路径：result.md、workspace/offer-generation-result.md）

完成后在团队房间 @customer-journey-leader:matrix-local.hiclaw.io:18080 通知我。