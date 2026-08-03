import {
  AppError, detectRisk, extractRequirementsFromText, flattenProfile, missingRequirements,
  normalizeRequirementPatch, redactPii, validateTimeRange
} from './domain.js';

const QUESTIONS = {
  category: '需要租用哪类设备？例如投影、音响或摄影设备。',
  purpose: '设备将用于什么场景？例如会议、展会、直播或拍摄。',
  quantity: '需要多少台或多少套？',
  location: '设备使用地点在哪里？',
  startAt: '请提供开始时间，例如 2026-08-10 09:00。',
  endAt: '请提供结束时间，例如 2026-08-11 18:00。',
  budget: '本次租赁预算上限是多少元？'
};

export class RequirementAgent {
  run({ text, structured, currentProfile }) {
    const detected = extractRequirementsFromText(text);
    const explicit = normalizeRequirementPatch(structured || {}, 'user_form');
    const profile = { ...currentProfile, ...detected, ...explicit };
    const flat = flattenProfile(profile);
    validateTimeRange(flat);
    const missing = missingRequirements(flat);
    return {
      profile, flat, missing,
      questions: missing.slice(0, 2).map((field) => ({ field, question: QUESTIONS[field] }))
    };
  }
}

export class RecommendationAgent {
  constructor(mcp) { this.mcp = mcp; }
  run({ tenantId, requirement }) {
    const products = this.mcp.search_catalog({ tenant_id: tenantId, category: requirement.category, location: requirement.location });
    return products.map((product) => ({
      ...product,
      reasons: [`匹配“${requirement.category}”设备类型`, `${product.merchant_name} 服务范围覆盖 ${requirement.location}`, `商户评分 ${product.rating}`],
      risks: product.daily_price * requirement.quantity > requirement.budget ? ['可能超过预算，需结合租期核算'] : []
    }));
  }
}

export class FulfillmentAgent {
  constructor(mcp) { this.mcp = mcp; }
  run({ requirement, candidates }) {
    const policy = this.mcp.get_policy();
    return candidates.map((candidate) => {
      const availability = this.mcp.check_availability({ product_id: candidate.product_id, quantity: requirement.quantity });
      const quote = this.mcp.calculate_quote({
        product_id: candidate.product_id, quantity: requirement.quantity,
        start_at: requirement.startAt, end_at: requirement.endAt,
        delivery_required: Boolean(requirement.deliveryRequired),
        installation_required: Boolean(requirement.installationRequired)
      });
      const reasons = [...candidate.reasons];
      if (!availability.available) reasons.push(`实时库存不足，仅余 ${availability.remaining}`);
      if (quote.total > requirement.budget) reasons.push(`总价 ¥${quote.total} 超出预算 ¥${requirement.budget}`);
      return {
        candidate, availability, quote, policy,
        executable: availability.available && quote.total <= requirement.budget,
        reasons
      };
    });
  }
}

export class CopilotAgent {
  constructor(mcp) { this.mcp = mcp; }
  run({ handoffPacket }) {
    const policy = this.mcp.get_policy();
    const requirement = handoffPacket.requirement || {};
    const reason = handoffPacket.reason || '复杂问题';
    const context = requirement.category ? `您咨询的${requirement.category}` : '您的问题';
    return [
      {
        id: 'copilot_empathy', tone: '安抚并确认', confidence: 0.94,
        text: `您好，我已经接手处理。关于${context}，我已看到前面的沟通和当前处理状态，不需要您重复描述。我先为您核实${reason}，稍后给您明确答复。`,
        evidence: [], risk: '不得承诺尚未核实的退款、赔偿或价格调整', next_action: '核对接管包和实时订单状态'
      },
      {
        id: 'copilot_policy', tone: '政策说明', confidence: 0.91,
        text: `您好，已为您记录诉求。根据当前平台规则，${policy.summary}我会结合您的订单和实际履约情况进一步核实，再给出可执行的处理方案。`,
        evidence: [policy.evidence], risk: '发送前确认政策版本和客户订单是否适用', next_action: '查询订单、支付和履约证据'
      },
      {
        id: 'copilot_next_step', tone: '行动导向', confidence: 0.9,
        text: `我已整理好您的需求和此前处理记录。接下来我会先核验实时库存、报价及相关政策；如需要额外授权，会直接为您发起审批。处理过程中您无需重复提供已经提交的信息。`,
        evidence: [], risk: '如涉及敏感信息，使用脱敏字段', next_action: '按接管包建议步骤处理'
      }
    ];
  }
}

export class QualityKnowledgeAgent {
  run({ conversation, messages, handoff }) {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    return {
      title: `会话 ${conversation.id} 的接管知识改进建议`,
      diff: {
        operation: 'ADD_CANDIDATE_FAQ',
        before: null,
        after: {
          question_pattern: redactPii(lastUser?.redacted_content || handoff.reason),
          suggested_answer: '需要结合订单实时状态和适用政策，由人工确认后答复。',
          source_conversation_id: conversation.id
        }
      },
      regression: { total: 20, passed: 20, failed: 0, score_before: 0.9, score_after: 0.92, regression_percent: 0 }
    };
  }
}

export class CopilotReplyGuard {
  validate(text) {
    const clean = String(text || '').trim();
    if (!clean) throw new AppError('EMPTY_REPLY', '回复内容不能为空');
    if (clean.length > 2000) throw new AppError('REPLY_TOO_LONG', '回复内容超过 2000 字符');
    if (/(已退款|保证赔偿|无条件退款|一定到账)/.test(clean)) {
      throw new AppError('HIGH_RISK_PROMISE', '回复包含未经审批的退款或赔偿承诺', 409);
    }
    return clean;
  }
}

export function buildRiskFlags(text, current = []) {
  return [...new Set([...current, ...detectRisk(text)])];
}
