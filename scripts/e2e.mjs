import assert from 'node:assert/strict';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const customerHeaders = { authorization: 'Bearer demo-customer-token', 'content-type': 'application/json' };
const operatorHeaders = { authorization: 'Bearer demo-operator-token', 'content-type': 'application/json' };

async function request(path, { method = 'GET', body, headers = customerHeaders } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json();
  assert.ok(response.ok, `${path}: ${value.error?.message || response.status}`);
  return value.result;
}

const health = await fetch(`${base}/health`).then((response) => response.json());
assert.equal(health.status, 'ok');
for (const page of ['/', '/ops']) {
  const response = await fetch(`${base}${page}`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /回声智能|客服运营台/);
}

const conversation = await request('/v1/conversations', { method: 'POST', body: { user_id: 'e2e_customer' } });
const offered = await request(`/v1/conversations/${conversation.id}/messages`, {
  method: 'POST',
  body: { text: '会议需要一套投影设备', structured: {
    category: '投影设备', purpose: '会议', quantity: 1, location: '上海市',
    startAt: '2026-08-10T09:00', endAt: '2026-08-11T18:00', budget: 3000, deliveryRequired: true
  } }
});
assert.equal(offered.conversation.state, 'OFFERED');
const confirmed = await request(`/v1/offers/${offered.offers[0].id}/confirm`, {
  method: 'POST', body: { state_version: offered.conversation.state_version }
});
assert.equal(confirmed.conversation.state, 'AWAITING_PAYMENT');
const paid = await request(`/v1/orders/${confirmed.order.id}/payment-confirmation`, { method: 'POST', body: {} });
assert.equal(paid.conversation.state, 'CONFIRMED');

const handoffConversation = await request('/v1/conversations', { method: 'POST', body: { user_id: 'e2e_handoff' } });
const transferred = await request(`/v1/conversations/${handoffConversation.id}/messages`, {
  method: 'POST', body: { text: '我要退款并找人工客服', structured: {} }
});
assert.equal(transferred.conversation.state, 'HUMAN_HANDOFF');
assert.equal(transferred.handoff.suggestions.length, 3);
const sent = await request(`/v1/handoffs/${transferred.handoff.id}/reply`, {
  method: 'POST', headers: operatorHeaders, body: { suggestion_id: 'copilot_empathy' }
});
assert.equal(sent.handoff.status, 'RESOLVED');
assert.equal(sent.proposal.status, 'PENDING_APPROVAL');
const approved = await request(`/v1/improvement-proposals/${sent.proposal.id}/decision`, {
  method: 'POST', headers: operatorHeaders, body: { decision: 'APPROVED' }
});
assert.equal(approved.status, 'APPROVED');

console.log(JSON.stringify({
  health: health.status, pages: ['customer', 'ops'], order_state: paid.conversation.state,
  handoff_state: sent.handoff.status, copilot_suggestions: transferred.handoff.suggestions.length,
  knowledge_proposal: approved.status
}, null, 2));
