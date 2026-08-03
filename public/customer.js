const token = 'demo-customer-token';
let conversation = null;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || '请求失败');
  return body.result;
}

function message(role, html) {
  const wrap = document.createElement('div');
  wrap.className = `message ${role}`;
  const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = role === 'user' ? '我' : 'AI';
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerHTML = html;
  wrap.append(avatar, bubble); document.querySelector('#timeline').append(wrap); wrap.scrollIntoView({ behavior: 'smooth' });
}

function escapeHtml(value) { const d=document.createElement('div'); d.textContent=String(value); return d.innerHTML; }

function structured() {
  const value = (id) => document.querySelector(`#${id}`).value;
  return {
    category:value('category'), purpose:value('purpose'), quantity:Number(value('quantity')),
    location:value('location'), startAt:value('startAt'), endAt:value('endAt'), budget:Number(value('budget')),
    deliveryRequired:document.querySelector('#deliveryRequired').checked,
    installationRequired:document.querySelector('#installationRequired').checked
  };
}

function renderOffers(offers, stateVersion) {
  const grid = document.createElement('div'); grid.className = 'offer-grid';
  for (const offer of offers) {
    const card = document.createElement('article'); card.className = 'offer-card';
    const evidence = offer.evidence.map((e) => `<span class="evidence">来源：${escapeHtml(e.title)} v${escapeHtml(e.version)}</span>`).join('');
    card.innerHTML = `<div class="merchant">${escapeHtml(offer.merchant_name)}</div><h3>${escapeHtml(offer.product_name)}</h3><div class="price">¥${offer.total_price}</div><ul>${offer.reasons.map((r)=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>${evidence}<button class="primary">确认并锁定 15 分钟</button>`;
    card.querySelector('button').addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      try {
        const result = await api(`/v1/offers/${offer.id}/confirm`, { method:'POST', body:JSON.stringify({ state_version:stateVersion }) });
        conversation = result.conversation;
        message('assistant', `<div class="order-card"><strong>库存已锁定，待支付订单已创建</strong><br>订单：${escapeHtml(result.order.id)}<br>锁定至：${new Date(result.hold.expiresAt).toLocaleString()}<br><br><a class="link-button" href="${result.order.paymentUrl}">前往模拟收银台</a></div>`);
      } catch (error) { message('assistant', `⚠️ ${escapeHtml(error.message)}`); event.currentTarget.disabled=false; }
    });
    grid.append(card);
  }
  document.querySelector('#timeline').append(grid); grid.scrollIntoView({behavior:'smooth'});
}

async function ensureConversation() {
  if (conversation) return conversation;
  conversation = await api('/v1/conversations', { method:'POST', body:JSON.stringify({ user_id:'h5_demo_user' }) });
  return conversation;
}

document.querySelector('#composer').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input=document.querySelector('#message'); const text=input.value.trim(); if(!text)return;
  message('user', escapeHtml(text)); input.value='';
  try {
    await ensureConversation();
    const result=await api(`/v1/conversations/${conversation.id}/messages`,{method:'POST',body:JSON.stringify({text,structured:structured()})});
    conversation=result.conversation; message('assistant',escapeHtml(result.reply));
    if(result.offers?.length) renderOffers(result.offers,conversation.state_version);
  } catch(error){message('assistant',`⚠️ ${escapeHtml(error.message)}`)}
});

document.querySelector('#human').addEventListener('click', async()=>{
  try{await ensureConversation(); const result=await api('/v1/handoffs',{method:'POST',body:JSON.stringify({conversation_id:conversation.id,reason:'客户主动请求人工客服'})});conversation=result.conversation;message('assistant',escapeHtml(result.reply));}
  catch(error){message('assistant',`⚠️ ${escapeHtml(error.message)}`)}
});
