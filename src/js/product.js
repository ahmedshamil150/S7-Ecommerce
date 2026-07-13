import { getProductById, getProductVariants, getReviews, getProducts } from './api.js';
import { addToCart, toggleWishlist, isInWishlist, showToast } from './main.js';

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

let product = null;
let variants = [];
let reviews = [];
let relatedProducts = [];
let selectedVariant = null;
let selectedVariantId = '';

async function init() {
  if (!productId) {
    document.getElementById('product-content').innerHTML = '<div class="col-span-full text-center py-20 text-on-surface-variant"><span class="material-symbols-outlined text-4xl mb-4 block">block</span><p>Product not found.</p></div>';
    return;
  }

  try {
    product = await getProductById(productId);
    if (!product) throw new Error('Not found');
  } catch {
    document.getElementById('product-content').innerHTML = '<div class="col-span-full text-center py-20 text-on-surface-variant"><span class="material-symbols-outlined text-4xl mb-4 block">block</span><p>Product not found.</p></div>';
    return;
  }

  const [v, r] = await Promise.all([
    getProductVariants(productId).catch(() => []),
    getReviews(productId).catch(() => []),
  ]);
  variants = v;
  reviews = r;

  // Fetch related products (same category, excluding current)
  const cats = Array.isArray(product.category) ? product.category : [];
  if (cats.length) {
    const all = await getProducts({ limit: 100 }).catch(() => []);
    relatedProducts = all.filter(p => {
      if (p.id === productId) return false;
      const pc = Array.isArray(p.category) ? p.category : [];
      return pc.some(c => cats.map(x => x.toLowerCase()).includes(c.toLowerCase()));
    }).slice(0, 4);
  }

  renderProduct();
  renderReviews();
  renderRelated();
}

function discPrice(p) {
  const d = p.discount_percent || 0;
  return d > 0 ? Math.round(p.price * (1 - d / 100)) : p.price;
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

function stars(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

function parseCats(cat) {
  if (Array.isArray(cat)) return cat;
  return (cat || '').split(',').map(c => c.trim()).filter(Boolean);
}

function renderProduct() {
  const content = document.getElementById('product-content');
  const images = [product.image_url, product.image_url_2, product.image_url_3].filter(Boolean);
  const d = product.discount_percent || 0;
  const finalPrice = discPrice(product);
  const cats = parseCats(product.category);

  // Determine variant options
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];
  const colors = [...new Set(variants.map(v => v.color).filter(Boolean))];

  let variantOptions = '';
  if (sizes.length || colors.length) {
    variantOptions = `
      <div class="mb-6">
        <p class="font-label-bold text-sm uppercase tracking-widest text-on-surface-variant mb-3">Available Options</p>
        ${sizes.length ? `
          <div class="mb-3">
            <p class="text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">Size</p>
            <div class="flex flex-wrap gap-2">
              ${sizes.map(s => `
                <button class="variant-option size-option border-2 border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold hover:border-secondary-fixed transition-all" data-size="${esc(s)}">
                  ${esc(s)}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
        ${colors.length ? `
          <div class="mb-3">
            <p class="text-xs font-semibold text-on-surface-variant mb-2 uppercase tracking-wider">Color</p>
            <div class="flex flex-wrap gap-2">
              ${colors.map(c => `
                <button class="variant-option color-option border-2 border-outline-variant rounded-lg px-4 py-2 text-sm font-semibold hover:border-secondary-fixed transition-all" data-color="${esc(c)}">
                  ${esc(c)}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
        <p id="variant-price-note" class="text-xs text-on-surface-variant mt-2"></p>
      </div>
    `;
  }

  const mainImg = images[0] || 'https://placehold.co/600x600?text=No+Image';

  content.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
      <!-- Image Gallery -->
      <div>
        <div class="relative w-full aspect-square bg-surface-container rounded-2xl overflow-hidden border border-outline-variant mb-4">
          ${d > 0 ? `<span class="absolute top-4 left-4 bg-primary text-secondary-fixed font-label-bold px-4 py-1.5 text-xs uppercase rounded z-10 skew-bg"><span class="skew-content">${d}% OFF</span></span>` : ''}
          <img id="main-image" src="${mainImg}" alt="${esc(product.title)}" class="w-full h-full object-cover" />
        </div>
        ${images.length > 1 ? `
          <div class="flex gap-3 overflow-x-auto no-scrollbar">
            ${images.map((img, i) => `
              <button class="thumb-btn w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden border-2 ${i === 0 ? 'border-secondary-fixed' : 'border-outline-variant'} transition-all hover:border-secondary-fixed" data-img="${img}">
                <img src="${img}" alt="" class="w-full h-full object-cover" />
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Product Info -->
      <div>
        <div class="flex flex-wrap gap-2 mb-3">
          ${cats.map(c => `<span class="text-on-surface-variant text-xs uppercase tracking-widest font-bold bg-surface-container px-3 py-1 rounded-full">${esc(c)}</span>`).join('')}
        </div>
        <h1 class="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface mb-4">${esc(product.title)}</h1>
        <div class="flex items-baseline gap-3 mb-6">
          <span class="font-display-lg text-3xl md:text-4xl font-black text-primary">Rs ${finalPrice.toLocaleString()}</span>
          ${d > 0 ? `<span class="text-lg text-on-surface-variant line-through">Rs ${Number(product.price).toLocaleString()}</span>` : ''}
        </div>

        ${variantOptions}

        <!-- Qty + Add to Cart -->
        <div class="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 mb-8">
          <div class="flex items-center border-2 border-outline-variant rounded-lg overflow-hidden self-start">
            <button id="qty-minus" class="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-lg font-bold hover:bg-surface-container transition-colors">−</button>
            <span id="qty-display" class="w-12 md:w-14 text-center font-bold text-sm">1</span>
            <button id="qty-plus" class="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center text-lg font-bold hover:bg-surface-container transition-colors">+</button>
          </div>
          <div class="flex items-center gap-3 flex-1">
            <button id="add-to-cart-btn" class="flex-1 bg-primary text-white px-6 md:px-8 py-3 md:py-3.5 font-label-bold text-sm rounded-lg btn-hover-volt transition-all uppercase tracking-widest flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-lg">shopping_cart</span> Add to Cart
            </button>
            <button id="wishlist-btn" class="w-12 h-12 flex items-center justify-center rounded-lg border-2 border-outline-variant hover:border-secondary-fixed transition-all ${isInWishlist(productId) ? 'text-secondary-fixed border-secondary-fixed' : 'text-on-surface-variant'}">
              <span class="material-symbols-outlined">${isInWishlist(productId) ? 'favorite' : 'favorite_border'}</span>
            </button>
          </div>
        </div>

        ${product.description ? `
          <div class="border-t border-outline-variant pt-6">
            <h3 class="font-headline-md text-lg mb-3">Description</h3>
            <p class="font-body-md text-on-surface-variant leading-relaxed">${esc(product.description)}</p>
          </div>
        ` : ''}

        ${product.weight_kg > 0 ? `
          <div class="border-t border-outline-variant pt-4 mt-4">
            <p class="text-sm text-on-surface-variant"><span class="font-semibold">Weight:</span> ${product.weight_kg} kg</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Image gallery thumbs
  content.querySelectorAll('.thumb-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.thumb-btn').forEach(b => b.classList.remove('border-secondary-fixed'));
      btn.classList.add('border-secondary-fixed');
      document.getElementById('main-image').src = btn.dataset.img;
    });
  });

  // Variant selection
  let selSize = '';
  let selColor = '';

  content.querySelectorAll('.size-option').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.size-option').forEach(b => b.classList.remove('border-secondary-fixed', 'bg-secondary-fixed', 'text-primary'));
      btn.classList.add('border-secondary-fixed', 'bg-secondary-fixed', 'text-primary');
      selSize = btn.dataset.size;
      updateSelectedVariant();
    });
  });

  content.querySelectorAll('.color-option').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.color-option').forEach(b => b.classList.remove('border-secondary-fixed', 'bg-secondary-fixed', 'text-primary'));
      btn.classList.add('border-secondary-fixed', 'bg-secondary-fixed', 'text-primary');
      selColor = btn.dataset.color;
      updateSelectedVariant();
    });
  });

  function updateSelectedVariant() {
    const note = document.getElementById('variant-price-note');
    if (!selSize && !selColor) { note.textContent = ''; selectedVariant = null; selectedVariantId = ''; return; }
    const match = variants.find(v => {
      const sizeMatch = !selSize || v.size === selSize;
      const colorMatch = !selColor || v.color === selColor;
      return sizeMatch && colorMatch;
    });
    if (match) {
      selectedVariant = match;
      selectedVariantId = match.id;
      if (match.price) {
        note.textContent = `Selected variant: ${match.size || ''} ${match.color || ''} — Rs ${Number(match.price).toLocaleString()}`;
      } else {
        note.textContent = `Selected: ${match.size || ''} ${match.color || ''} (${match.stock > 0 ? 'In stock' : 'Out of stock'})`;
      }
    } else {
      selectedVariant = null;
      selectedVariantId = '';
      note.textContent = 'Selected combination not available';
    }
  }

  // Quantity
  let qty = 1;
  document.getElementById('qty-minus').addEventListener('click', () => { if (qty > 1) { qty--; document.getElementById('qty-display').textContent = qty; } });
  document.getElementById('qty-plus').addEventListener('click', () => { qty++; document.getElementById('qty-display').textContent = qty; });

  // Add to cart
  document.getElementById('add-to-cart-btn').addEventListener('click', () => {
    const vPrice = selectedVariant?.price;
    const vLabel = selectedVariant ? `${selectedVariant.size || ''} ${selectedVariant.color || ''}`.trim() : '';
    const usePrice = vPrice || finalPrice;
    addToCart(productId, product.title, Number(usePrice), qty, selectedVariantId, vLabel);
  });

  // Wishlist
  document.getElementById('wishlist-btn').addEventListener('click', () => {
    const nowIn = toggleWishlist(productId, product.title, finalPrice, mainImg);
    const btn = document.getElementById('wishlist-btn');
    btn.querySelector('span').textContent = nowIn ? 'favorite' : 'favorite_border';
    btn.classList.toggle('text-secondary-fixed', !nowIn);
    btn.classList.toggle('border-secondary-fixed', !nowIn);
    btn.classList.toggle('text-on-surface-variant', nowIn);
    btn.classList.toggle('border-outline-variant', nowIn);
  });
}

function renderReviews() {
  const container = document.getElementById('reviews-list');
  const pinned = reviews.filter(r => r.pinned);
  const normal = reviews.filter(r => !r.pinned);

  if (!reviews.length) {
    container.innerHTML = '<p class="text-on-surface-variant text-sm">No reviews yet. Be the first to review!</p>';
    return;
  }

  container.innerHTML = [...pinned, ...normal].map((r, i) => `
    <div class="border-b border-outline-variant pb-4 ${i > 0 ? 'pt-4' : ''}">
      ${r.pinned ? '<span class="pin-badge">Pinned</span>' : ''}
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-sm">${esc(r.author_name)}</span>
          <span class="text-[10px] text-on-surface-variant">${new Date(r.created_at).toLocaleDateString('en-PK')}</span>
        </div>
        <span class="rating-stars text-sm">${stars(r.rating)}</span>
      </div>
      <p class="text-sm text-on-surface-variant leading-relaxed">${esc(r.comment)}</p>
    </div>
  `).join('');
}

function renderRelated() {
  const container = document.getElementById('related-grid');
  if (!relatedProducts.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = relatedProducts.map(p => {
    const img = p.image_url || 'https://placehold.co/400x400?text=No+Image';
    const d = p.discount_percent || 0;
    const fp = discPrice(p);
    return `<a href="./product?id=${p.id}" class="product-card bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden group block">
      <div class="relative w-full aspect-square bg-surface-container overflow-hidden">
        ${d > 0 ? `<span class="absolute top-3 left-3 bg-primary text-secondary-fixed font-label-bold px-3 py-1 text-[10px] uppercase rounded z-10 skew-bg"><span class="skew-content">${d}% OFF</span></span>` : ''}
        <div class="w-full h-full bg-cover bg-center group-hover:scale-105 transition-transform duration-500" style="background-image: url('${img}')"></div>
      </div>
      <div class="px-4 py-4">
        <span class="text-on-surface-variant text-xs uppercase tracking-widest font-bold">${Array.isArray(p.category) ? p.category[0] || 'Equipment' : 'Equipment'}</span>
        <h4 class="font-headline-md text-lg mt-1 text-on-surface">${esc(p.title)}</h4>
        <div class="flex items-center gap-2 mt-1">
          <span class="font-bold text-lg text-primary">Rs ${fp.toLocaleString()}</span>
          ${d > 0 ? `<span class="text-sm text-on-surface-variant line-through">Rs ${Number(p.price).toLocaleString()}</span>` : ''}
        </div>
      </div>
    </a>`;
  }).join('');
}

init();
