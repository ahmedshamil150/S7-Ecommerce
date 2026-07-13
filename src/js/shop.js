import { getProducts, getCategories, getProductsCount } from './api.js';
import { addToCart, toggleWishlist, isInWishlist, showToast } from './main.js';

const grid = document.getElementById('product-grid');
const chipsEl = document.getElementById('category-chips');
const searchInput = document.getElementById('search-input');
const sortSelect = document.getElementById('sort-select');
const saleToggle = document.getElementById('sale-toggle');
const resultsCount = document.getElementById('results-count');
const paginationEl = document.getElementById('pagination');

const PER_PAGE = 20;
let categories = ['Bats', 'Balls', 'Pads & Guards', 'Gloves', 'Helmets', 'Bags', 'Accessories'];
let allProducts = [];
let activeCategory = '';
let filterDisc = false;
let searchQuery = '';
let sortState = '';
let currentPage = 1;
let totalProducts = 0;

async function init() {
  const params = new URLSearchParams(window.location.search);
  const catParam = params.get('category');
  if (catParam) activeCategory = catParam;

  await loadCategories();
  renderChips();
  await loadProducts();

  searchInput?.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    currentPage = 1;
    renderGrid();
  });

  sortSelect?.addEventListener('change', (e) => {
    sortState = e.target.value;
    renderGrid();
  });

  saleToggle?.addEventListener('click', () => {
    filterDisc = !filterDisc;
    saleToggle.classList.toggle('bg-primary', filterDisc);
    saleToggle.classList.toggle('text-secondary-fixed', filterDisc);
    saleToggle.classList.toggle('bg-surface-container-low', !filterDisc);
    currentPage = 1;
    renderGrid();
  });
}

async function loadCategories() {
  try {
    const cats = await getCategories();
    if (cats?.length) categories = cats.map(c => c.name);
  } catch { }
}

function renderChips() {
  if (!chipsEl) return;
  const all = ['', ...categories];
  chipsEl.innerHTML = all.map(cat => `
    <button class="category-chip whitespace-nowrap px-4 py-1.5 rounded-full border border-outline-variant text-sm font-semibold transition-all ${(cat === activeCategory) ? 'active' : 'text-on-surface-variant hover:border-primary'}"
      data-cat="${cat}">${cat || 'All'}</button>
  `).join('');

  chipsEl.querySelectorAll('.category-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      chipsEl.querySelector('.active')?.classList.remove('active');
      btn.classList.add('active');
      activeCategory = btn.dataset.cat;
      currentPage = 1;
      renderGrid();
    });
  });
}

async function loadProducts() {
  try {
    const [products, count] = await Promise.all([
      getProducts({ limit: 100 }),
      getProductsCount(),
    ]);
    allProducts = products || [];
    totalProducts = count || allProducts.length;
    renderGrid();
  } catch {
    grid.innerHTML = '<p class="col-span-full text-center py-20 text-on-surface-variant">Failed to load gear.</p>';
  }
}

function filteredProducts() {
  let list = [...allProducts];

  if (activeCategory) {
    list = list.filter(p => {
      const cats = Array.isArray(p.category) ? p.category : [p.category || ''];
      return cats.some(c => c.toLowerCase() === activeCategory.toLowerCase());
    });
  }

  if (filterDisc) {
    list = list.filter(p => (p.discount_percent || 0) > 0);
  }

  if (searchQuery) {
    list = list.filter(p =>
      p.title?.toLowerCase().includes(searchQuery) ||
      p.description?.toLowerCase().includes(searchQuery)
    );
  }

  if (sortState === 'asc') list.sort((a, b) => discPrice(a) - discPrice(b));
  else if (sortState === 'desc') list.sort((a, b) => discPrice(b) - discPrice(a));

  return list;
}

function discPrice(p) {
  const d = p.discount_percent || 0;
  return d > 0 ? Math.round(p.price * (1 - d / 100)) : p.price;
}

function renderGrid() {
  const filtered = filteredProducts();
  totalProducts = filtered.length;
  const totalPages = Math.ceil(totalProducts / PER_PAGE);
  const start = (currentPage - 1) * PER_PAGE;
  const pageProducts = filtered.slice(start, start + PER_PAGE);

  resultsCount.textContent = `${totalProducts} product${totalProducts !== 1 ? 's' : ''}`;

  if (!pageProducts.length) {
    grid.innerHTML = '<p class="col-span-full text-center py-20 text-on-surface-variant">No gear found matching your criteria.</p>';
    grid.classList.add('visible');
    paginationEl.classList.add('hidden');
    return;
  }

  grid.innerHTML = pageProducts.map(p => {
    const img = p.image_url || 'https://placehold.co/400x400?text=No+Image';
    const d = p.discount_percent || 0;
    const finalPrice = discPrice(p);
    const wishlisted = isInWishlist(p.id);
    const badge = d > 0 ? `${d}% OFF` : '';

    return `<div class="product-card bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden group flex flex-col">
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
        <span class="text-on-surface-variant text-xs uppercase tracking-widest font-bold">${Array.isArray(p.category) ? p.category[0] || 'Equipment' : p.category || 'Equipment'}</span>
        <h4 class="font-headline-md text-lg mt-1 text-on-surface">${p.title}</h4>
        <div class="flex items-center gap-2 mt-1">
          <span class="font-bold text-lg text-primary">Rs ${finalPrice.toLocaleString()}</span>
          ${d > 0 ? `<span class="text-sm text-on-surface-variant line-through">Rs ${p.price.toLocaleString()}</span>` : ''}
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
  renderPagination(totalPages);

  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
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

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    paginationEl.classList.add('hidden');
    return;
  }
  paginationEl.classList.remove('hidden');

  let html = '';
  html += `<button class="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-primary hover:text-secondary-fixed transition-all ${currentPage <= 1 ? 'opacity-30 pointer-events-none' : ''}" data-page="${currentPage - 1}"><span class="material-symbols-outlined">chevron_left</span></button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      html += `<span class="w-10 h-10 rounded-full bg-primary text-secondary-fixed flex items-center justify-center font-bold text-sm">${i}</span>`;
    } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
      html += `<button class="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-primary hover:text-secondary-fixed transition-all font-bold text-sm" data-page="${i}">${i}</button>`;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += `<span class="text-on-surface-variant text-sm">...</span>`;
    }
  }

  html += `<button class="w-10 h-10 rounded-full border border-outline-variant flex items-center justify-center hover:bg-primary hover:text-secondary-fixed transition-all ${currentPage >= totalPages ? 'opacity-30 pointer-events-none' : ''}" data-page="${currentPage + 1}"><span class="material-symbols-outlined">chevron_right</span></button>`;

  paginationEl.innerHTML = html;

  paginationEl.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderGrid();
        window.scrollTo({ top: 300, behavior: 'smooth' });
      }
    });
  });
}

init();
