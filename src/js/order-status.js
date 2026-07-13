import { trackOrder, cancelOrder, requestReturn } from './api.js';
import { showToast } from './main.js';
import { generateInvoice, generateDeliveryChallan } from './pdf-utils.js';

let currentOrder = null;

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

function statusClass(status) {
  const map = {
    pending: 'bg-yellow-100 text-yellow-800',
    confirmed: 'bg-green-100 text-green-800',
    shipped: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    return_requested: 'bg-orange-100 text-orange-800',
    returned: 'bg-purple-100 text-purple-800',
    return_rejected: 'bg-red-100 text-red-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
}

function stars(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function showOrderModal() {
  document.getElementById('order-modal').classList.remove('hidden');
}

async function doLookup(orderId, phone) {
  const contentEl = document.getElementById('order-modal-content');
  const errorEl = document.getElementById('order-error');
  contentEl.innerHTML = '<div class="text-center py-8"><div class="animate-spin w-8 h-8 border-4 border-secondary-fixed border-t-transparent rounded-full mx-auto mb-3"></div><p class="text-on-surface-variant text-sm">Looking up your order...</p></div>';
  errorEl.classList.add('hidden');
  showOrderModal();

  try {
    const orders = await trackOrder(orderId, phone);
    const o = Array.isArray(orders) ? orders[0] : orders;
    if (!o) throw new Error("We couldn't find an order matching that ID and phone number. Double-check your details and try again.");
    currentOrder = o;
    renderOrder(o);
  } catch (err) {
    contentEl.innerHTML = `<div class="text-center py-12"><span class="material-symbols-outlined text-5xl text-secondary-fixed mb-4">search_off</span><p class="text-on-surface-variant text-sm max-w-xs mx-auto">${esc(err.message || "We couldn't find an order matching that ID and phone number. Double-check your details and try again.")}</p><button onclick="closeOrderModal()" class="mt-6 bg-primary text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-primary/80 transition-all uppercase tracking-widest">Try Again</button></div>`;
  }
}

function renderOrder(o) {
  const contentEl = document.getElementById('order-modal-content');
  const items = Array.isArray(o.items) ? o.items : [];

  contentEl.innerHTML = `
    <div class="mb-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p class="text-xs text-on-surface-variant uppercase tracking-widest font-semibold mb-1">Order Number</p>
          <h2 class="font-headline-md text-xl md:text-2xl text-on-surface">${esc(o.order_number || o.id)}</h2>
        </div>
        <span class="px-4 py-1.5 rounded-full text-sm font-bold ${statusClass(o.status)} capitalize">${o.status.replace(/_/g, ' ')}</span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
        <div>
          <p class="text-on-surface-variant text-xs uppercase tracking-widest font-semibold mb-1">Date</p>
          <p class="font-medium">${new Date(o.created_at).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div>
          <p class="text-on-surface-variant text-xs uppercase tracking-widest font-semibold mb-1">Customer</p>
          <p class="font-medium">${esc(o.customer_name)}</p>
        </div>
        <div>
          <p class="text-on-surface-variant text-xs uppercase tracking-widest font-semibold mb-1">Phone</p>
          <p class="font-medium">${esc(o.customer_phone)}</p>
        </div>
      </div>

      <div class="mb-6">
        <p class="text-on-surface-variant text-xs uppercase tracking-widest font-semibold mb-1">Delivery Address</p>
        <p class="text-sm">${esc(o.customer_address)}</p>
      </div>

      <div class="border-t border-outline-variant pt-4">
        <p class="text-xs text-on-surface-variant uppercase tracking-widest font-semibold mb-3">Items</p>
        <div class="space-y-3">
          ${items.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-outline-variant/50 last:border-0">
              <div>
                <p class="text-sm font-medium">${esc(item.title)}</p>
                ${item.variant_label ? `<p class="text-xs text-on-surface-variant">${esc(item.variant_label)}</p>` : ''}
                <p class="text-xs text-on-surface-variant">Qty: ${item.qty || 1}</p>
              </div>
              <p class="text-sm font-semibold">Rs ${(Number(item.price || 0) * Number(item.qty || 1)).toLocaleString()}</p>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="border-t border-outline-variant pt-4 mt-2 flex justify-between items-center">
        <span class="font-bold text-lg">Total</span>
        <span class="font-bold text-lg">Rs ${Number(o.total || 0).toLocaleString()}</span>
      </div>
    </div>

    <div class="flex flex-wrap gap-3">
      ${o.status === 'pending' ? `
        <button id="cancel-order-btn" class="bg-red-500 text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-red-600 transition-all">Cancel Order</button>
      ` : ''}
      ${['confirmed', 'shipped', 'delivered'].includes(o.status) ? `
        <button id="download-invoice-btn" class="bg-primary text-white px-4 py-2.5 text-sm font-semibold rounded-lg hover:bg-primary/80 transition-all flex items-center gap-1.5"><span class="material-symbols-outlined text-lg">receipt</span> Invoice</button>
        <button id="download-challan-btn" class="bg-primary text-white px-4 py-2.5 text-sm font-semibold rounded-lg hover:bg-primary/80 transition-all flex items-center gap-1.5"><span class="material-symbols-outlined text-lg">assignment</span> Challan</button>
        <button id="request-return-btn" class="bg-orange-500 text-white px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-orange-600 transition-all">Request Return</button>
      ` : ''}
      <button onclick="closeOrderModal()" class="bg-surface-container-highest text-on-surface px-6 py-2.5 text-sm font-semibold rounded-lg hover:bg-surface-variant transition-all ml-auto">Close</button>
    </div>
  `;

  document.getElementById('cancel-order-btn')?.addEventListener('click', async () => {
    const ok = await confirmAction('This will cancel your S7 Sports order permanently. Continue?');
    if (!ok) return;
    const btn = document.getElementById('cancel-order-btn');
    btn.disabled = true; btn.textContent = 'Cancelling...';
    try {
      const result = await cancelOrder(o.order_number || o.id, o.customer_phone);
      renderOrder(Array.isArray(result) ? result[0] : result);
      showToast('Order cancelled. Refund will be processed within 3-5 business days.');
    } catch (err) {
      showToast(err.message || 'Unable to cancel. Please contact S7 Sports support.', 'error');
      btn.disabled = false; btn.textContent = 'Cancel Order';
    }
  });

  document.getElementById('download-invoice-btn')?.addEventListener('click', () => {
    generateInvoice(currentOrder);
  });

  document.getElementById('download-challan-btn')?.addEventListener('click', () => {
    generateDeliveryChallan(currentOrder);
  });

  document.getElementById('request-return-btn')?.addEventListener('click', async () => {
    const ok = await confirmAction('Submit a return request for admin review? You will be notified once approved.');
    if (!ok) return;
    const btn = document.getElementById('request-return-btn');
    btn.disabled = true; btn.textContent = 'Requesting...';
    try {
      const result = await requestReturn(o.order_number || o.id, o.customer_phone);
      renderOrder(Array.isArray(result) ? result[0] : result);
      showToast('Return submitted. S7 Sports team will review within 24 hours.');
    } catch (err) {
      showToast(err.message || 'Return request failed. Email s7sportspk@gmail.com for help.', 'error');
      btn.disabled = false; btn.textContent = 'Request Return';
    }
  });
}

// Auto-lookup from URL param
const params = new URLSearchParams(window.location.search);
const urlId = params.get('id');
const urlPhone = params.get('phone');

document.getElementById('track-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const orderId = document.getElementById('lookup-id').value.trim();
  const phone = document.getElementById('lookup-phone').value.trim();
  if (orderId && phone) doLookup(orderId, phone);
});

if (urlId) {
  document.getElementById('lookup-id').value = urlId;
  if (urlPhone) {
    document.getElementById('lookup-phone').value = urlPhone;
    doLookup(urlId, urlPhone);
  } else {
    // Focus phone field after redirect from checkout
    document.getElementById('lookup-phone').focus();
  }
}
