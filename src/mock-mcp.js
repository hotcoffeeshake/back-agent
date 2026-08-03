import { AppError, id, nowIso } from './domain.js';

const POLICY_EVIDENCE = {
  doc_id: 'policy_rental_platform_v5',
  version: '5.0',
  title: '平台设备租赁与取消政策',
  chunk_id: 'cancel-and-deposit',
  score: 0.97
};

export class MockBusinessMcpGateway {
  constructor(store, { offerTtlMs = 60_000, holdTtlMs = 15 * 60_000 } = {}) {
    this.store = store;
    this.offerTtlMs = offerTtlMs;
    this.holdTtlMs = holdTtlMs;
  }

  search_catalog({ tenant_id, category, location }) {
    return this.store.searchProducts(tenant_id, category, location).map((product) => ({
      product_id: product.id,
      merchant_id: product.merchant_id,
      merchant_name: product.merchant_name,
      product_name: product.name,
      description: product.description,
      daily_price: product.daily_price,
      rating: product.rating,
      evidence: { ...product.evidence, chunk_id: product.id, score: 0.94 }
    }));
  }

  get_product_detail({ product_id }) {
    const product = this.store.getProduct(product_id);
    return { ...product, evidence: { ...product.evidence, chunk_id: product.id, score: 0.96 } };
  }

  check_availability({ product_id, quantity }) {
    const product = this.store.getProduct(product_id);
    const held = this.store.activeHeldQuantity(product_id);
    const remaining = Math.max(0, product.stock - held);
    return { available: remaining >= quantity, remaining, checked_at: nowIso(), source: 'mock_realtime_inventory' };
  }

  calculate_quote({ product_id, quantity, start_at, end_at, delivery_required = false, installation_required = false }) {
    const product = this.store.getProduct(product_id);
    const durationMs = new Date(end_at).getTime() - new Date(start_at).getTime();
    const days = Math.max(1, Math.ceil(durationMs / 86_400_000));
    const rental = product.daily_price * quantity * days;
    const delivery = delivery_required ? 200 : 0;
    const installation = installation_required ? 300 : 0;
    return {
      currency: 'CNY', days, rental, delivery, installation,
      total: rental + delivery + installation,
      calculated_at: nowIso(), source: 'mock_pricing_engine'
    };
  }

  get_policy() {
    return {
      summary: '库存锁定 15 分钟；支付前可免费释放。改价、退款和政策例外必须转人工审批。',
      evidence: POLICY_EVIDENCE
    };
  }

  hold_inventory({ conversation_id, offer, idempotency_key }) {
    const cached = this.store.getIdempotent(idempotency_key);
    if (cached) return cached;
    return this.store.transaction(() => {
      const availability = this.check_availability({ product_id: offer.product_id, quantity: offer.quantity });
      if (!availability.available) throw new AppError('INVENTORY_CONFLICT', '库存已发生变化，请重新选择方案', 409, availability);
      const hold = {
        id: id('hold'), conversationId: conversation_id, offerId: offer.id, productId: offer.product_id,
        quantity: offer.quantity, status: 'ACTIVE', expiresAt: new Date(Date.now() + this.holdTtlMs).toISOString(),
        idempotencyKey: idempotency_key, createdAt: nowIso()
      };
      this.store.insertHold(hold);
      this.store.putIdempotent(idempotency_key, hold);
      return hold;
    });
  }

  release_hold({ hold_id }) {
    this.store.updateHoldStatus(hold_id, 'RELEASED');
    return { hold_id, status: 'RELEASED', released_at: nowIso() };
  }

  create_order_draft({ conversation_id, offer, hold, idempotency_key }) {
    const cached = this.store.getIdempotent(idempotency_key);
    if (cached) return cached;
    const order = {
      id: id('ord'), conversationId: conversation_id, offerId: offer.id, holdId: hold.id,
      status: 'AWAITING_PAYMENT', paymentUrl: `/pay.html?order_id=`, totalPrice: offer.total_price,
      currency: offer.currency, idempotencyKey: idempotency_key, createdAt: nowIso()
    };
    order.paymentUrl += order.id;
    this.store.insertOrder(order);
    this.store.putIdempotent(idempotency_key, order);
    return order;
  }

  get_order_status({ order_id }) { return this.store.getOrder(order_id); }

  create_handoff({ conversation, packet, reason, suggestions = [] }) {
    const handoff = {
      id: id('handoff'), conversationId: conversation.id, status: 'OPEN', reason,
      packet, suggestions, createdAt: nowIso()
    };
    this.store.insertHandoff(handoff);
    return this.store.getHandoff(handoff.id);
  }

  toolManifest() {
    return [
      ['search_catalog', 'catalog:read', false], ['get_product_detail', 'catalog:read', false],
      ['check_availability', 'inventory:read', false], ['calculate_quote', 'pricing:read', false],
      ['get_policy', 'policy:read', false], ['get_order_status', 'order:read', false],
      ['hold_inventory', 'inventory:hold', true], ['release_hold', 'inventory:release', true],
      ['create_order_draft', 'order:draft:create', true], ['create_handoff', 'handoff:create', true]
    ].map(([name, scope, write]) => ({ name, scope, write, timeout_ms: 3000, retries: write ? 0 : 2 }));
  }
}

export { POLICY_EVIDENCE };
