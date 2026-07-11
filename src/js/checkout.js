import { getCartItems, updateCartBadge, showToast } from './main.js';
import { placeOrder, getCharges } from './api.js';

let cart = [];
let couponCode = sessionStorage.getItem('s7_coupon') || '';
let deliveryFee = 0;
let taxAmount = 0;
let taxPercent = 0;
let submitting = false;

async function init() {
  cart = getCartItems();
  if (!cart.length) {
    document.getElementById('checkout-content').innerHTML = `
      <div class="text-center py-20">
        <span class="material-symbols-outlined text-6xl text-outline-variant mb-4 block">shopping_cart</span>
        <h2 class="font-headline-md text-2xl text-on-surface mb-2">Your cart is empty</h2>
        <p class="text-on-surface-variant mb-8">Add some gear before checking out.</p>
        <a href="./shop" class="inline-block bg-primary text-white px-10 py-4 font-label-bold rounded-lg btn-hover-volt transition-all uppercase tracking-widest">Shop Now</a>
      </div>
    `;
    return;
  }

  // Load charges for tax/delivery defaults
  try {
    const charges = await getCharges();
    const taxC = charges.find(c => c.key === 'tax_percent');
    if (taxC) taxPercent = Number(taxC.value) || 0;
  } catch {}

  renderItems();
  updateSummary();
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

function subtotal() {
  return cart.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
}

async function calcDelivery() {
  const addr = document.getElementById('address').value.trim();
  const cityMatch = addr.match(/(rawalpindi|islamabad)/i);
  const city = cityMatch ? cityMatch[1].toLowerCase() : 'other';
  const feeEl = document.getElementById('delivery-fee-display');
  const totalWeight = document.getElementById('total-weight');

  try {
    const res = await fetch('/api/calculate-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, cart }),
    });
    const data = await res.json();
    deliveryFee = data.fee || 0;
    feeEl.textContent = `Rs ${deliveryFee.toLocaleString()}${data.local ? ' (Local)' : ' (Outstation)'}`;
    if (totalWeight) totalWeight.textContent = '';
    if (!data.local && totalWeight) {
      let w = 0;
      for (const item of cart) {
        try {
          const p = await fetch(`https://tzuoxizcsdllnklkodtx.supabase.co/rest/v1/products?id=eq.${item.id}&select=weight_kg`, {
            headers: { apikey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6dW94aXpjc2RsbG5rbGtvZHR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY5NjA3MzQsImV4cCI6MjA2MjUzNjczNH0.pNzFL0YKB_0f5XSzQmqJ8B3Cv8n_FpMwVs_FPsKQy2A' },
          }).then(r => r.json());
          const kg = parseFloat(p?.[0]?.weight_kg ?? 0);
          w += kg * (item.qty || 1);
        } catch {}
      }
      if (w > 0) totalWeight.textContent = `(Weight: ${Math.round(w * 100) / 100} kg)`;
    }
    updateSummary();
  } catch {
    feeEl.textContent = 'Could not calculate. Will be confirmed.';
  }
}

function renderItems() {
  const container = document.getElementById('checkout-items');
  container.innerHTML = cart.map(item => `
    <div class="flex items-center gap-3">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-on-surface truncate">${esc(item.title)}</p>
        ${item.variant_label ? `<p class="text-xs text-on-surface-variant">${esc(item.variant_label)}</p>` : ''}
        <p class="text-xs text-on-surface-variant">Qty: ${item.qty}</p>
      </div>
      <p class="text-sm font-semibold">Rs ${(Number(item.price) * Number(item.qty)).toLocaleString()}</p>
    </div>
  `).join('');
}

function updateSummary() {
  const st = subtotal();
  const discountPct = 0; // We'll load from coupon validation
  let discountAmount = 0;
  taxAmount = Math.round(st * taxPercent / 100);
  const total = st + deliveryFee + taxAmount - discountAmount;

  document.getElementById('summary-subtotal').textContent = `Rs ${st.toLocaleString()}`;
  document.getElementById('summary-delivery').textContent = `Rs ${deliveryFee.toLocaleString()}`;
  const taxEl = document.getElementById('summary-tax');
  if (taxPercent > 0) {
    taxEl.parentElement.style.display = 'flex';
    taxEl.textContent = `Rs ${taxAmount.toLocaleString()}`;
  } else {
    taxEl.parentElement.style.display = 'none';
  }
  document.getElementById('summary-total').textContent = `Rs ${total.toLocaleString()}`;

  if (couponCode) {
    document.getElementById('summary-coupon-row').style.display = 'flex';
    // Validate coupon to get discount percent
    import('./api.js').then(({ validateCoupon }) => {
      validateCoupon(couponCode).then(result => {
        const dAmt = Math.round(st * result.discount_percent / 100);
        document.getElementById('summary-discount').textContent = `\u2212Rs ${dAmt.toLocaleString()}`;
        document.getElementById('summary-total').textContent = `Rs ${(st + deliveryFee + taxAmount - dAmt).toLocaleString()}`;
      }).catch(() => {});
    });
  }
}

document.getElementById('address')?.addEventListener('input', () => {
  clearTimeout(window._deliveryTimer);
  window._deliveryTimer = setTimeout(calcDelivery, 600);
});

document.getElementById('checkout-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (submitting) return;
  submitting = true;
  const btn = document.getElementById('place-order-btn');
  btn.disabled = true;
  btn.textContent = 'Placing order...';

  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const address = document.getElementById('address').value.trim();

  // Re-calc delivery before submit
  await calcDelivery();

  try {
    const st = subtotal();
    const total = st + deliveryFee + taxAmount;

    const orderId = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });

    const items = cart.map(i => ({
      id: i.id,
      title: i.title,
      price: i.price,
      qty: i.qty,
      ...(i.variant_id ? { variant_id: i.variant_id } : {}),
      ...(i.variant_label ? { variant_label: i.variant_label } : {}),
    }));

    const result = await placeOrder({
      id: orderId,
      customer_name: name,
      customer_phone: phone,
      customer_address: address,
      items,
      total,
      delivery_fee: deliveryFee,
      tax_amount: taxAmount,
    }, couponCode || null);

    // Success - clear cart and coupon
    localStorage.setItem('s7_cart', '[]');
    sessionStorage.removeItem('s7_coupon');
    updateCartBadge();
    showToast(`Order placed! ID: ${result.order_number}`);

    window.location.href = `./order-status?id=${result.order_number}`;
  } catch (err) {
    showToast(err.message || 'Failed to place order', 'error');
    btn.disabled = false;
    btn.textContent = 'Place Order';
    submitting = false;
  }
});

init();
