import { getCartItems, updateCartBadge, showToast } from './main.js';
import { validateCoupon } from './api.js';

let cart = [];
let couponDiscount = 0;
let couponCode = '';

function loadCart() {
  cart = getCartItems();
  render();
}

function saveCart() {
  localStorage.setItem('s7_cart', JSON.stringify(cart));
  updateCartBadge();
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

function subtotal() {
  return cart.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);
}

function total() {
  const st = subtotal();
  return st - couponDiscount;
}

function render() {
  const container = document.getElementById('cart-items');
  const summaryEl = document.getElementById('cart-summary');
  const emptyEl = document.getElementById('cart-empty');

  if (!cart.length) {
    container.innerHTML = '';
    summaryEl.innerHTML = '';
    emptyEl.style.display = '';
    document.getElementById('coupon-section')?.classList.add('hidden');
    return;
  }

  emptyEl.style.display = 'none';
  document.getElementById('coupon-section')?.classList.remove('hidden');

  const st = subtotal();
  const tot = total();

  container.innerHTML = cart.map((item, i) => {
    const lineTotal = Number(item.price) * Number(item.qty);
    const img = item.image || 'https://placehold.co/80x80?text=No+Img';
    return `
      <div class="flex items-center gap-4 py-4 border-b border-outline-variant cart-item" data-index="${i}">
        <img src="${img}" alt="${esc(item.title)}" class="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover bg-surface-container flex-shrink-0" onerror="this.src='https://placehold.co/80x80?text=?'" />
        <div class="flex-1 min-w-0">
          <h4 class="font-semibold text-sm md:text-base text-on-surface truncate">${esc(item.title)}</h4>
          ${item.variant_label ? `<p class="text-xs text-on-surface-variant mt-0.5">${esc(item.variant_label)}</p>` : ''}
          <p class="text-sm font-bold text-on-surface mt-1">Rs ${Number(item.price).toLocaleString()}</p>
        </div>
        <div class="flex items-center border-2 border-outline-variant rounded-lg overflow-hidden flex-shrink-0">
          <button class="qty-minus w-8 h-8 flex items-center justify-center text-sm font-bold hover:bg-surface-container transition-colors" data-index="${i}">−</button>
          <span class="w-8 text-center text-sm font-bold">${item.qty}</span>
          <button class="qty-plus w-8 h-8 flex items-center justify-center text-sm font-bold hover:bg-surface-container transition-colors" data-index="${i}">+</button>
        </div>
        <p class="text-sm font-bold text-on-surface w-20 text-right flex-shrink-0">Rs ${lineTotal.toLocaleString()}</p>
        <button class="remove-item text-on-surface-variant hover:text-error transition-colors flex-shrink-0" data-index="${i}">
          <span class="material-symbols-outlined text-lg">delete</span>
        </button>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.qty-minus').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (cart[idx].qty > 1) { cart[idx].qty--; saveCart(); render(); }
    });
  });

  container.querySelectorAll('.qty-plus').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      cart[idx].qty++;
      saveCart();
      render();
    });
  });

  container.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      cart.splice(idx, 1);
      saveCart();
      render();
      showToast('Item removed from cart');
    });
  });

  summaryEl.innerHTML = `
    <div class="space-y-3 text-sm">
      <div class="flex justify-between"><span class="text-on-surface-variant">Subtotal</span><span class="font-semibold">Rs ${st.toLocaleString()}</span></div>
      ${couponDiscount > 0 ? `<div class="flex justify-between"><span class="text-on-surface-variant">Discount (${esc(couponCode)})</span><span class="font-semibold text-green-600">−Rs ${couponDiscount.toLocaleString()}</span></div>` : ''}
      <div class="flex justify-between text-xs text-on-surface-variant">
        <span>Delivery</span><span>Calculated at checkout</span>
      </div>
      <div class="border-t border-outline-variant pt-3 flex justify-between text-base font-bold">
        <span>Total</span><span>Rs ${tot.toLocaleString()}</span>
      </div>
    </div>
    <a href="./checkout" class="block w-full bg-primary text-white text-center py-3 mt-6 font-label-bold text-sm rounded-lg btn-hover-volt transition-all uppercase tracking-widest">
      Proceed to Checkout
    </a>
    <a href="./shop" class="block w-full text-center py-3 mt-2 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors">
      Continue Shopping
    </a>
  `;
}

async function applyCoupon() {
  const input = document.getElementById('coupon-input');
  const msg = document.getElementById('coupon-msg');
  const code = input.value.trim();
  if (!code) { msg.textContent = 'Enter a coupon code'; msg.className = 'text-error text-sm'; return; }

  const btn = document.getElementById('apply-coupon-btn');
  btn.disabled = true; btn.textContent = 'Checking...';

  try {
    const result = await validateCoupon(code);
    couponDiscount = Math.round(subtotal() * result.discount_percent / 100);
    couponCode = code.toUpperCase();
    msg.textContent = `Coupon applied! ${result.discount_percent}% off (Rs ${couponDiscount.toLocaleString()})`;
    msg.className = 'text-green-600 text-sm';
    input.readOnly = true;
    btn.textContent = 'Applied';
    btn.disabled = false;
    render();
    showToast(`Coupon ${code.toUpperCase()} applied!`);
  } catch (err) {
    couponDiscount = 0;
    couponCode = '';
    msg.textContent = err.message || 'Invalid coupon';
    msg.className = 'text-error text-sm';
    btn.disabled = false;
    btn.textContent = 'Apply';
    render();
  }
}

document.getElementById('apply-coupon-btn')?.addEventListener('click', applyCoupon);
document.getElementById('coupon-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });

loadCart();
