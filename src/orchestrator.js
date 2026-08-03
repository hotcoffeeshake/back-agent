import {
  AppError, STATES, flattenProfile, hmacToken, id, nowIso, redactPii, verifyHmacToken
} from './domain.js';
import {
  CopilotAgent, CopilotReplyGuard, FulfillmentAgent, QualityKnowledgeAgent,
  RecommendationAgent, RequirementAgent, buildRiskFlags
} from './agents.js';

export class EchoService {
  constructor(store, mcp, config = {}) {
    this.store = store;
    this.mcp = mcp;
    this.secret = config.confirmationSecret || 'local-only-change-me';
    this.offerTtlMs = config.offerTtlMs || 60_000;
    this.requirementAgent = new RequirementAgent();
    this.recommendationAgent = new RecommendationAgent(mcp);
    this.fulfillmentAgent = new FulfillmentAgent(mcp);
    this.copilotAgent = new CopilotAgent(mcp);
    this.qualityAgent = new QualityKnowledgeAgent();
    this.replyGuard = new CopilotReplyGuard();
  }

  createConversation({ tenantId = 'tenant_demo', userId = 'anonymous', actorType = 'customer' }) {
    const createdAt = nowIso();
    const conversation = this.store.createConversation({
      id: id('conv'), tenantId, userId, actorType, state: STATES.RECEIVED,
      stateVersion: 1, traceId: id('trace'), createdAt
    });
    this.audit(conversation, actorType, userId, 'conversation.create', 'conversation', conversation.id, {});
    return conversation;
  }

  addAssistantMessage(conversation, content, metadata = {}) {
    this.store.addMessage({ id: id('msg'), conversationId: conversation.id, role: 'assistant', content,
      redactedContent: redactPii(content), metadata, createdAt: nowIso() });
  }

  transition(conversation, state, patch = {}) {
    return this.store.updateConversation(conversation.id, conversation.state_version, { ...patch, state });
  }

  sendMessage(conversationId, { text, structured = {} }, actor) {
    const conversation = this.store.getConversation(conversationId);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问该会话', 403);
    const messageId = id('msg');
    this.store.addMessage({ id: messageId, conversationId, role: 'user', content: text,
      redactedContent: redactPii(text), metadata: { structured_fields: Object.keys(structured) }, createdAt: nowIso() });
    const riskFlags = buildRiskFlags(text, conversation.risk_flags);
    if (riskFlags.includes('HUMAN_REQUEST_OR_HIGH_RISK')) {
      const updated = this.store.updateConversation(conversation.id, conversation.state_version, { riskFlags });
      return this.createHandoff({ conversationId, reason: '用户要求人工或问题涉及退款、投诉、改价等高风险事项' }, actor, updated);
    }

    const diagnosis = this.requirementAgent.run({ text, structured, currentProfile: conversation.requirement_profile });
    let current = this.store.updateConversation(conversation.id, conversation.state_version, {
      state: diagnosis.missing.length ? STATES.CLARIFYING : STATES.REQUIREMENTS_READY,
      requirementProfile: diagnosis.profile, riskFlags
    });
    if (diagnosis.missing.length) {
      const reply = `为了给出可下单方案，还需要确认：${diagnosis.questions.map((item) => item.question).join(' ')}`;
      this.addAssistantMessage(current, reply, { agent: 'requirement-agent', missing: diagnosis.missing });
      this.audit(current, 'customer', actor.actorId, 'agent.requirement.clarify', 'conversation', current.id, { missing: diagnosis.missing });
      return this.conversationResult(current, reply, { missing_fields: diagnosis.missing, questions: diagnosis.questions });
    }

    current = this.transition(current, STATES.SEARCHING);
    const candidates = this.recommendationAgent.run({ tenantId: current.tenant_id, requirement: diagnosis.flat });
    if (!candidates.length) {
      return this.createHandoff({ conversationId, reason: '目录中没有覆盖当前品类或服务区域的候选设备' }, actor, current);
    }
    current = this.transition(current, STATES.VALIDATING);
    const validations = this.fulfillmentAgent.run({ requirement: diagnosis.flat, candidates });
    const executable = validations.filter((item) => item.executable).slice(0, 3);
    for (const item of executable) {
      const offer = {
        id: id('offer'), conversationId, productId: item.candidate.product_id,
        merchantId: item.candidate.merchant_id, quantity: diagnosis.flat.quantity,
        totalPrice: item.quote.total, currency: item.quote.currency, available: true,
        validUntil: new Date(Date.now() + this.offerTtlMs).toISOString(),
        evidence: [item.candidate.evidence, item.policy.evidence], reasons: item.reasons,
        status: 'ACTIVE', createdAt: nowIso()
      };
      this.store.insertOffer(offer);
    }
    if (!executable.length) {
      return this.createHandoff({ conversationId, reason: '候选设备均因库存或预算约束无法形成可执行方案' }, actor, current, { validations });
    }
    current = this.transition(current, STATES.OFFERED);
    const offers = this.store.listOffers(conversationId, true);
    const reply = `已实时校验并找到 ${offers.length} 个可执行方案。报价有效 60 秒，请选择后确认锁定库存。`;
    this.addAssistantMessage(current, reply, { agent: 'fulfillment-agent', offer_ids: offers.map((offer) => offer.id) });
    this.audit(current, 'customer', actor.actorId, 'agent.offer.created', 'conversation', current.id, { offer_ids: offers.map((offer) => offer.id) });
    return this.conversationResult(current, reply, { offers }, offers.flatMap((offer) => offer.evidence));
  }

  listOffers(conversationId, actor) {
    const conversation = this.store.getConversation(conversationId);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问该会话', 403);
    return { conversation, offers: this.store.listOffers(conversationId, true) };
  }

  confirmOffer(offerId, { stateVersion }, actor) {
    const offer = this.store.getOffer(offerId);
    let conversation = this.store.getConversation(offer.conversation_id);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问该方案', 403);
    const idem = `${conversation.tenant_id}:${conversation.id}:confirm:${stateVersion}`;
    const cached = this.store.getIdempotent(idem);
    if (cached) return cached;
    if (conversation.state !== STATES.OFFERED || conversation.state_version !== Number(stateVersion)) {
      throw new AppError('STATE_VERSION_CONFLICT', '方案确认状态已变化，请刷新', 409);
    }
    if (new Date(offer.valid_until) <= new Date()) throw new AppError('OFFER_EXPIRED', '报价已过期，请重新获取方案', 409);
    const token = hmacToken(this.secret, { conversationId: conversation.id, offerId, stateVersion, actorId: actor.actorId, exp: Date.now() + 30_000 });
    const payload = verifyHmacToken(this.secret, token);
    if (payload.conversationId !== conversation.id || payload.offerId !== offerId) throw new AppError('INVALID_CONFIRMATION_TOKEN', '确认令牌范围错误', 403);
    conversation = this.transition(conversation, STATES.USER_CONFIRMED);
    let hold;
    try {
      hold = this.mcp.hold_inventory({ conversation_id: conversation.id, offer, idempotency_key: `${idem}:hold` });
      conversation = this.transition(conversation, STATES.HELD);
      const order = this.mcp.create_order_draft({ conversation_id: conversation.id, offer, hold, idempotency_key: `${idem}:order` });
      conversation = this.transition(conversation, STATES.DRAFT_ORDER_CREATED);
      conversation = this.transition(conversation, STATES.AWAITING_PAYMENT);
      const result = { conversation: this.publicConversation(conversation), hold, order };
      this.store.putIdempotent(idem, result);
      this.audit(conversation, 'customer', actor.actorId, 'order.draft.create', 'order', order.id, { offer_id: offerId, hold_id: hold.id });
      return result;
    } catch (error) {
      if (hold) this.mcp.release_hold({ hold_id: hold.id });
      const latest = this.store.getConversation(conversation.id);
      if (latest.state !== STATES.HUMAN_HANDOFF) this.store.updateConversation(latest.id, latest.state_version, { state: STATES.FAILED });
      throw error;
    }
  }

  confirmPayment(orderId, actor) {
    const order = this.store.getOrder(orderId);
    let conversation = this.store.getConversation(order.conversation_id);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问该订单', 403);
    if (order.status === 'PAID') return { order, conversation: this.publicConversation(conversation) };
    if (conversation.state !== STATES.AWAITING_PAYMENT) throw new AppError('INVALID_STATE', '订单当前不可支付', 409);
    const paid = this.store.updateOrder(orderId, 'PAID');
    conversation = this.transition(conversation, STATES.CONFIRMED);
    this.audit(conversation, actor.actorType, actor.actorId, 'payment.confirmed', 'order', orderId, {});
    return { order: paid, conversation: this.publicConversation(conversation) };
  }

  createHandoff(input, actor, suppliedConversation = null, extras = {}) {
    let conversation = suppliedConversation || this.store.getConversation(input.conversationId);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问该会话', 403);
    if (conversation.state !== STATES.HUMAN_HANDOFF) conversation = this.transition(conversation, STATES.HUMAN_HANDOFF);
    const packet = {
      summary: redactPii(this.store.listMessages(conversation.id).filter((m) => m.role === 'user').map((m) => m.redacted_content).join('；')),
      requirement: flattenProfile(conversation.requirement_profile),
      offers: this.store.listOffers(conversation.id),
      evidence: this.store.listOffers(conversation.id).flatMap((offer) => offer.evidence),
      tool_results: extras.validations || [], risk_flags: conversation.risk_flags,
      reason: input.reason, suggested_next_step: '核对实时订单与适用政策，使用 Copilot 建议作为草稿并人工确认发送'
    };
    let handoff = this.mcp.create_handoff({ conversation, packet, reason: input.reason });
    const suggestions = this.copilotAgent.run({ handoffPacket: packet });
    handoff = this.store.updateHandoffSuggestions(handoff.id, suggestions);
    const reply = '该问题已转交人工客服，前序需求和处理证据已同步。人工客服会在 Copilot 辅助下继续处理，您无需重复描述。';
    this.addAssistantMessage(conversation, reply, { agent: 'team-leader', handoff_id: handoff.id });
    this.audit(conversation, actor.actorType, actor.actorId, 'handoff.create_with_copilot', 'handoff', handoff.id, { reason: input.reason, suggestion_count: suggestions.length });
    return this.conversationResult(conversation, reply, { handoff });
  }

  regenerateCopilot(handoffId, actor) {
    const handoff = this.store.getHandoff(handoffId);
    const conversation = this.store.getConversation(handoff.conversation_id);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问接管任务', 403);
    const suggestions = this.copilotAgent.run({ handoffPacket: handoff.packet });
    const updated = this.store.updateHandoffSuggestions(handoffId, suggestions);
    this.audit(conversation, 'operator', actor.actorId, 'copilot.suggestions.regenerate', 'handoff', handoffId, { count: suggestions.length });
    return updated;
  }

  sendOperatorReply(handoffId, { text, suggestionId }, actor) {
    const handoff = this.store.getHandoff(handoffId);
    const conversation = this.store.getConversation(handoff.conversation_id);
    if (conversation.tenant_id !== actor.tenantId) throw new AppError('FORBIDDEN', '无权访问接管任务', 403);
    const selected = suggestionId ? handoff.suggestions.find((item) => item.id === suggestionId) : null;
    const finalText = this.replyGuard.validate(text || selected?.text);
    this.store.addMessage({ id: id('msg'), conversationId: conversation.id, role: 'operator', content: finalText,
      redactedContent: redactPii(finalText), metadata: { copilot_suggestion_id: selected?.id || null, human_approved: true }, createdAt: nowIso() });
    const resolved = this.store.resolveHandoff(handoffId, actor.actorId, finalText);
    const quality = this.qualityAgent.run({ conversation, messages: this.store.listMessages(conversation.id), handoff });
    const proposal = { id: id('prop'), tenantId: conversation.tenant_id, conversationId: conversation.id,
      ...quality, status: 'PENDING_APPROVAL', createdAt: nowIso() };
    this.store.insertProposal(proposal);
    this.audit(conversation, 'operator', actor.actorId, 'operator.reply.send', 'handoff', handoffId, {
      copilot_suggestion_id: selected?.id || null, edited: Boolean(text && selected && text !== selected.text), proposal_id: proposal.id
    });
    return { handoff: resolved, proposal: this.store.getProposal(proposal.id) };
  }

  decideProposal(proposalId, decision, actor) {
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new AppError('INVALID_DECISION', 'decision 仅支持 APPROVED 或 REJECTED');
    const proposal = this.store.getProposal(proposalId);
    if (proposal.regression.regression_percent > 2 && decision === 'APPROVED') throw new AppError('REGRESSION_GATE_FAILED', '回归指标下降超过 2%，禁止发布', 409);
    const updated = this.store.decideProposal(proposalId, decision, actor.actorId);
    this.store.audit({ traceId: id('trace'), actorType: 'operator', actorId: actor.actorId,
      action: `knowledge.proposal.${decision.toLowerCase()}`, resourceType: 'proposal', resourceId: proposalId,
      detail: { published: decision === 'APPROVED', note: '本地 MVP 仅模拟发布；生产由审批服务更新 OSS/百炼知识库' } });
    return updated;
  }

  publicConversation(conversation) {
    return {
      id: conversation.id, tenant_id: conversation.tenant_id, state: conversation.state,
      state_version: conversation.state_version, trace_id: conversation.trace_id,
      requirement_profile: flattenProfile(conversation.requirement_profile), risk_flags: conversation.risk_flags,
      created_at: conversation.created_at, updated_at: conversation.updated_at
    };
  }

  conversationResult(conversation, reply, extra = {}, evidence = []) {
    return { conversation: this.publicConversation(conversation), reply, ...extra, evidence };
  }

  audit(conversation, actorType, actorId, action, resourceType, resourceId, detail) {
    this.store.audit({ traceId: conversation.trace_id, actorType, actorId, action, resourceType, resourceId, detail });
  }
}
