import { getProducts, getProductsCount } from './api.js';
import { addToCart, toggleWishlist, isInWishlist, showToast } from './main.js';

async function loadFeaturedProducts() {
  const grid = document.getElementById('home-product-grid');
  if (!grid) return;

  try {
    const products = await getProducts({ featured: true, limit: 10 });
    if (!products.length) {
      const all = await getProducts({ limit: 10 });
      if (all.length) renderProducts(all, grid);
      return;
    }
    renderProducts(products, grid);
  } catch {
    grid.innerHTML = '<p class="col-span-full text-center text-gray-text py-8">Unable to load products.</p>';
  }
}

function renderProducts(products, grid) {
  if (!products.length) {
    grid.innerHTML = '<p class="col-span-full text-center text-gray-text py-8">No products yet. Check back soon!</p>';
    grid.classList.add('visible');
    return;
  }

  grid.innerHTML = products.map(p => {
    const img = p.image_url || 'https://placehold.co/300x300?text=No+Image';
    const discount = p.discount_percent || 0;
    const originalPrice = discount > 0 ? p.price : null;
    const finalPrice = discount > 0 ? Math.round(p.price * (1 - discount / 100)) : p.price;

    return `<div class="product-card bg-white rounded-xl overflow-hidden shadow-sm">
      <a href="./product?id=${p.id}" class="img-wrap block">
        <img src="${img}" alt="${p.title}" loading="lazy" class="w-full aspect-square object-cover" />
      </a>
      <div class="p-3">
        <h3 class="font-medium text-sm text-charcoal truncate">${p.title}</h3>
        <div class="flex items-center gap-2 mt-1">
          <span class="font-bold text-primary">Rs ${finalPrice.toLocaleString()}</span>
          ${originalPrice ? `<span class="text-xs text-gray-light line-through">Rs ${originalPrice.toLocaleString()}</span>` : ''}
          ${discount > 0 ? `<span class="text-xs font-semibold text-red-500">-${discount}%</span>` : ''}
        </div>
        <div class="flex gap-2 mt-3">
          <button class="flex-1 text-xs font-semibold bg-primary text-white py-2 rounded-full hover:bg-primary-dark transition-colors add-to-cart" data-id="${p.id}" data-title="${p.title}" data-price="${finalPrice}">Add to Cart</button>
          <button class="w-8 h-8 flex items-center justify-center rounded-full border border-gray-200 hover:border-primary transition-colors wishlist-btn ${isInWishlist(p.id) ? 'text-red-500 border-red-200' : 'text-gray-light'}" data-id="${p.id}" data-title="${p.title}" data-price="${finalPrice}" data-image="${img}">
            <span class="material-symbols-outlined text-lg">${isInWishlist(p.id) ? 'favorite' : 'favorite_border'}</span>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.classList.add('visible');

  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => {
      addToCart(btn.dataset.id, btn.dataset.title, parseFloat(btn.dataset.price));
    });
  });

  grid.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const isNow = toggleWishlist(btn.dataset.id, btn.dataset.title, parseFloat(btn.dataset.price), btn.dataset.image);
      btn.querySelector('span').textContent = isNow ? 'favorite_border' : 'favorite';
      btn.classList.toggle('text-red-500', !isNow);
      btn.classList.toggle('border-red-200', !isNow);
      btn.classList.toggle('text-gray-light', isNow);
    });
  });
}

loadFeaturedProducts();
