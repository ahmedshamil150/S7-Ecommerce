import { getWishlist, removeFromWishlist, addToCart, updateWishlistBadge, showToast } from './main.js';

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

function load() {
  const items = getWishlist();
  const grid = document.getElementById('wishlist-grid');
  const empty = document.getElementById('wishlist-empty');

  if (!items.length) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = items.map(item => `
    <div class="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden flex flex-col" data-id="${item.id}">
      <div class="aspect-square bg-surface-container overflow-hidden">
        <img src="${esc(item.image) || 'https://placehold.co/300x300?text=No+Img'}" alt="${esc(item.title)}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" onerror="this.src='https://placehold.co/300x300?text=?'" />
      </div>
      <div class="p-4 flex flex-col flex-1">
        <h3 class="font-semibold text-sm text-on-surface line-clamp-2 mb-1">${esc(item.title)}</h3>
        <p class="text-lg font-bold text-primary mt-auto mb-3">Rs ${Number(item.price).toLocaleString()}</p>
        <div class="flex gap-2">
          <button class="add-cart-btn flex-1 bg-primary text-white text-sm font-semibold py-2.5 rounded-lg btn-hover-volt transition-all" data-id="${item.id}" data-title="${esc(item.title)}" data-price="${item.price}" data-image="${esc(item.image)}">Add to Cart</button>
          <button class="remove-wishlist-btn w-10 h-10 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:text-error hover:border-error transition-all" data-id="${item.id}" title="Remove">
            <span class="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.add-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      addToCart(btn.dataset.id, btn.dataset.title, btn.dataset.price);
    });
  });

  grid.querySelectorAll('.remove-wishlist-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      removeFromWishlist(id);
      const card = btn.closest('[data-id]');
      if (card) card.remove();
      if (!getWishlist().length) {
        document.getElementById('wishlist-grid').innerHTML = '';
        document.getElementById('wishlist-empty').classList.remove('hidden');
      }
      showToast('Removed from Wishlist');
    });
  });
}

load();
