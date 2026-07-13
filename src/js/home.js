import { getProducts } from './api.js';
import { addToCart, toggleWishlist, isInWishlist } from './main.js';

async function loadFeaturedProducts() {
  const grid = document.getElementById('home-product-grid');
  if (!grid) return;

  try {
    const products = await getProducts({ featured: true, limit: 8 });
    if (!products.length) {
      const all = await getProducts({ limit: 8 });
      if (all.length) renderProducts(all, grid);
      else empty(grid);
      return;
    }
    renderProducts(products, grid);
  } catch {
    empty(grid);
  }
}

function empty(grid) {
  grid.innerHTML = '<p class="col-span-full text-center text-on-surface-variant py-12">No products yet. Check back soon!</p>';
  grid.classList.add('visible');
}

function renderProducts(products, grid) {
  if (!products.length) return empty(grid);

  grid.innerHTML = products.map(p => {
    const img = p.image_url || 'https://placehold.co/400x400?text=No+Image';
    const discount = p.discount_percent || 0;
    const originalPrice = discount > 0 ? p.price : null;
    const finalPrice = discount > 0 ? Math.round(p.price * (1 - discount / 100)) : p.price;
    const wishlisted = isInWishlist(p.id);
    const badge = discount > 0 ? 'Sale' : (p.featured ? 'New' : '');

    return `<div class="product-card bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden flex-shrink-0 group flex flex-col">
      <div class="relative w-full aspect-square bg-surface-container overflow-hidden flex-shrink-0">
        ${badge ? `<span class="absolute top-3 left-3 bg-primary text-secondary-fixed font-label-bold px-3 py-1 text-[10px] uppercase rounded z-10 skew-bg"><span class="skew-content">${badge}</span></span>` : ''}
        <a href="./product?id=${p.id}" class="block w-full h-full">
          <div class="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500" style="background-image: url('${img}')"></div>
        </a>
        <button class="absolute bottom-3 right-3 w-10 h-10 bg-secondary-fixed text-primary rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform add-to-cart" data-id="${p.id}" data-title="${p.title}" data-price="${finalPrice}">
          <span class="material-symbols-outlined text-lg">add</span>
        </button>
      </div>
      <div class="px-4 pt-4 pb-4 flex flex-col flex-1">
        <span class="text-on-surface-variant text-xs uppercase tracking-widest font-bold">${p.category?.[0] || 'Equipment'}</span>
        <h4 class="font-headline-md text-lg mt-1 text-on-surface">${p.title}</h4>
        <div class="flex items-center gap-2 mt-1">
          <span class="font-bold text-lg text-primary">Rs ${finalPrice.toLocaleString()}</span>
          ${originalPrice ? `<span class="text-sm text-on-surface-variant line-through">Rs ${originalPrice.toLocaleString()}</span>` : ''}
        </div>
        <div class="flex gap-2 mt-3 mt-auto">
          <button class="flex-1 bg-primary text-white text-xs font-bold py-2.5 rounded-lg hover:opacity-90 transition-all uppercase tracking-wider add-to-cart" data-id="${p.id}" data-title="${p.title}" data-price="${finalPrice}">Add to Cart</button>
          <button class="w-9 h-9 flex items-center justify-center rounded-lg border border-outline-variant hover:border-primary transition-all wishlist-btn ${wishlisted ? 'text-secondary-fixed' : 'text-on-surface-variant'}" data-id="${p.id}" data-title="${p.title}" data-price="${finalPrice}" data-image="${img}">
            <span class="material-symbols-outlined text-lg">${wishlisted ? 'favorite' : 'favorite_border'}</span>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');

  grid.classList.add('visible');

  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      addToCart(btn.dataset.id, btn.dataset.title, parseFloat(btn.dataset.price));
    });
  });

  grid.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nowIn = toggleWishlist(btn.dataset.id, btn.dataset.title, parseFloat(btn.dataset.price), btn.dataset.image);
      btn.querySelector('span').textContent = nowIn ? 'favorite_border' : 'favorite';
      btn.classList.toggle('text-secondary-fixed', !nowIn);
      btn.classList.toggle('text-on-surface-variant', nowIn);
    });
  });
}

loadFeaturedProducts();
