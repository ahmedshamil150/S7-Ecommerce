import {
  getProducts, getOrders, createProduct, updateProduct, deleteProduct, deleteOrder, updateOrderStatus,
  getAllReviews, deleteReview, setReviewPinned, getProductsCount, getOrdersCount, uploadImage,
  getCoupons, createCoupon, deleteCoupon,
  getCategories, createCategory, updateCategory, deleteCategory,
  getActiveHeroImage, getHeroImages, setHeroImage,
  getProductVariants, createVariant, updateVariant, deleteVariant,
  getInvoices, getInvoicesCount, deleteInvoice, cancelInvoiceByAdmin, getInvoiceByOrderId,
  getCharges, upsertCharge, deleteCharge,
  clearCache,
} from './api.js';
import { generateInvoice, generateDeliveryChallan } from './pdf-utils.js';

function parseCats(cat) {
  if (Array.isArray(cat)) return cat.map(c => String(c).trim()).filter(Boolean);
  return (cat || '').split(',').map(c => c.trim()).filter(Boolean);
}

function displayCats(catStr) {
  return parseCats(catStr).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') || 'General';
}

function esc(str) {
  const el = document.createElement('span');
  el.textContent = str ?? '';
  return el.innerHTML;
}

function stars(rating) {
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

const ORDER_STATUSES = [
  'pending', 'confirmed', 'shipped', 'delivered',
  'cancelled', 'return_requested', 'returned', 'return_rejected',
];

const REVENUE_STATUSES = new Set(['cancelled', 'return_requested', 'returned']);

const DEFAULT_CATS = ['Bats', 'Protective', 'Footwear', 'Apparel', 'Accessories', 'Balls', 'Others'];
let CATEGORIES = [...DEFAULT_CATS];

async function loadCategories() {
  clearCache('categories');
  try {
    const cats = await getCategories();
    if (cats && cats.length) {
      CATEGORIES = cats.map(c => c.name);
    }
  } catch {}
  const container = document.getElementById('p-categories');
  if (container) {
    container.innerHTML = CATEGORIES.map(c => `
      <label style="display:flex;align-items:center;gap:4px;font-weight:400;font-size:13px;cursor:pointer;">
        <input type="checkbox" value="${c.toLowerCase()}" /> ${c}
      </label>
    `).join('');
  }
  const sel = document.getElementById('filter-category');
  if (sel) {
    sel.innerHTML = '<option value="">All Categories</option>';
    CATEGORIES.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.toLowerCase();
      opt.textContent = c;
      sel.appendChild(opt);
    });
  }
}

function countStatus(orders, status) {
  return orders.filter(o => o.status === status).length;
}

function calcRevenue(orders) {
  return orders
    .filter(o => !REVENUE_STATUSES.has(o.status))
    .reduce((s, o) => s + (Number(o.total) || 0), 0);
}

const isLoginPage = document.getElementById('admin-login-form') !== null;

// Auth guard
if (!isLoginPage && !sessionStorage.getItem('s7_admin')) {
  window.location.href = './login';
}

// Logout
document.getElementById('logout-btn')?.addEventListener('click', e => {
  e.preventDefault();
  sessionStorage.removeItem('s7_admin');
  window.location.href = './login';
});

// Mobile sidebar
function initAdminMobileNav() {
  const burger = document.getElementById('admin-burger');
  const sidebar = document.getElementById('admin-sidebar');
  const overlay = document.getElementById('admin-overlay');
  if (!burger || !sidebar) return;

  const close = () => {
    sidebar.classList.remove('open');
    overlay?.classList.remove('open');
    document.body.classList.remove('admin-nav-open');
    burger.setAttribute('aria-expanded', 'false');
  };

  burger.addEventListener('click', () => {
    const isOpen = sidebar.classList.toggle('open');
    overlay?.classList.toggle('open', isOpen);
    document.body.classList.toggle('admin-nav-open', isOpen);
    burger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  });

  overlay?.addEventListener('click', close);
  sidebar.querySelectorAll('nav a').forEach(link => link.addEventListener('click', close));
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) close();
  });
}

if (!isLoginPage) initAdminMobileNav();

// --- Dashboard ---
if (document.getElementById('stat-products')) {
  (async () => {
    const [products, orders, reviews] = await Promise.all([
      getProducts(), getOrders(), getAllReviews(),
    ]);

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('stat-products', products.length);
    set('stat-revenue', `Rs ${calcRevenue(orders).toLocaleString()}`);
    set('stat-reviews', reviews.length);
    set('stat-pending', countStatus(orders, 'pending'));
    set('stat-confirmed', countStatus(orders, 'confirmed'));
    set('stat-shipped', countStatus(orders, 'shipped'));
    set('stat-delivered', countStatus(orders, 'delivered'));
    set('stat-cancelled', countStatus(orders, 'cancelled'));
    set('stat-return-requested', countStatus(orders, 'return_requested'));
    set('stat-returned', countStatus(orders, 'returned'));

    // Revenue chart
    const chartCanvas = document.getElementById('revenue-chart');
    if (chartCanvas && typeof Chart !== 'undefined') {
      let chartInstance = null;
      const chartOrders = orders.filter(o => !REVENUE_STATUSES.has(o.status));

      function buildChartData(days) {
        const labels = [];
        const values = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(d.getDate() - i);
          labels.push(d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }));
          const dayOrders = chartOrders.filter(o => {
            const t = new Date(o.created_at).getTime();
            return t >= d.getTime() && t < d.getTime() + 86400000;
          });
          values.push(dayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0));
        }
        return { labels, values };
      }

      function renderChart(days) {
        const { labels, values } = buildChartData(days);
        if (chartInstance) chartInstance.destroy();
        chartInstance = new Chart(chartCanvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Revenue (Rs)',
              data: values,
              backgroundColor: 'rgba(202, 243, 0, 0.5)',
              borderColor: '#caf300',
              borderWidth: 1,
              borderRadius: 4,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { callback: v => `Rs ${v.toLocaleString()}` } },
              x: { grid: { display: false } },
            },
          },
        });
      }

      renderChart(7);

      document.getElementById('chart-7d')?.addEventListener('click', () => {
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('chart-7d').classList.add('active');
        renderChart(7);
      });

      document.getElementById('chart-30d')?.addEventListener('click', () => {
        document.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('chart-30d').classList.add('active');
        renderChart(30);
      });
    }
  })();
}

// --- Products CRUD ---
const productsTable = document.getElementById('products-table');
if (productsTable) {
  document.body.insertAdjacentHTML('beforeend', `
    <div id="product-modal" class="modal-overlay" style="display:none;">
      <div class="modal-box">
        <h3 id="modal-title">Add Product</h3>
        <form id="product-form">
          <input type="hidden" id="p-id" />
          <label>Title *<input id="p-title" type="text" required /></label>
          <label>Description<textarea id="p-desc" rows="3"></textarea></label>
          <label>Price (Rs) *<input id="p-price" type="number" min="0" step="0.01" required /></label>
          <label>Categories *
            <div id="p-categories" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
              ${CATEGORIES.map(c => `
                <label style="display:flex;align-items:center;gap:4px;font-weight:400;font-size:13px;cursor:pointer;">
                  <input type="checkbox" value="${c.toLowerCase()}" /> ${c}
                </label>
              `).join('')}
            </div>
          </label>
          <label>Stock <small>(total for products without variants)</small><input id="p-stock" type="number" min="0" value="0" /></label>
          <label>Weight (kg) <small>(for outstation delivery – Rs 150/kg)</small><input id="p-weight" type="number" min="0" step="0.001" value="0" placeholder="e.g. 1.5" /></label>
          <div class="variants-section">
            <strong style="display:block;margin-bottom:8px;">Variants <small style="font-weight:400;color:#888;">(size/color with separate stock & price)</small></strong>
            <div id="variants-list"></div>
            <button type="button" id="add-variant-btn" class="button" style="background:#555;font-size:12px;margin-top:8px;">+ Add Variant</button>
            <div id="variants-empty" style="color:#888;font-size:13px;padding:8px 0;">No variants yet</div>
          </div>
          <label>Discount (%)<input id="p-discount" type="number" min="0" max="100" value="0" /></label>
          <label class="checkbox-label">
            <input id="p-featured" type="checkbox" />
            Featured product (shows on homepage)
          </label>
          <label>Image 1 *
            <div class="img-upload-row">
              <input id="p-img1-file" type="file" accept="image/jpeg,image/png,image/webp" />
              <div class="img-preview" id="p-img1-preview"></div>
              <input id="p-img1" type="hidden" />
            </div>
          </label>
          <label>Image 2
            <div class="img-upload-row">
              <input id="p-img2-file" type="file" accept="image/jpeg,image/png,image/webp" />
              <div class="img-preview" id="p-img2-preview"></div>
              <input id="p-img2" type="hidden" />
            </div>
          </label>
          <label>Image 3
            <div class="img-upload-row">
              <input id="p-img3-file" type="file" accept="image/jpeg,image/png,image/webp" />
              <div class="img-preview" id="p-img3-preview"></div>
              <input id="p-img3" type="hidden" />
            </div>
          </label>
          <div class="modal-actions">
            <button type="button" id="modal-cancel" class="button" style="background:#555;color:#fff;">Cancel</button>
            <button type="submit" class="button" id="modal-save">Save</button>
          </div>
          <p id="modal-error" style="color:#ef5350;display:none;margin-top:0.5rem;"></p>
        </form>
      </div>
    </div>
  `);

  const modal = document.getElementById('product-modal');
  const modalForm = document.getElementById('product-form');

  function setPreview(id, url) {
    const el = document.getElementById(id);
    el.innerHTML = url ? `<img src="${url}" alt="preview" />` : '';
  }

  function openModal(product = null) {
    document.getElementById('modal-title').textContent = product ? 'Edit Product' : 'Add Product';
    document.getElementById('p-id').value        = product?.id || '';
    document.getElementById('p-title').value     = product?.title || '';
    document.getElementById('p-desc').value      = product?.description || '';
    document.getElementById('p-price').value     = product?.price || '';
    const savedCats = new Set(parseCats(product?.category).map(c => c.toLowerCase()));
    document.querySelectorAll('#p-categories input[type="checkbox"]').forEach(cb => {
      cb.checked = savedCats.has(cb.value);
    });
    document.getElementById('p-stock').value     = product?.stock ?? 0;
    document.getElementById('p-weight').value    = product?.weight_kg ?? 0;
    document.getElementById('p-discount').value  = product?.discount_percent ?? 0;
    document.getElementById('p-featured').checked = product?.featured || false;
    document.getElementById('p-img1').value      = product?.image_url || '';
    document.getElementById('p-img2').value      = product?.image_url_2 || '';
    document.getElementById('p-img3').value      = product?.image_url_3 || '';
    ['p-img1-file', 'p-img2-file', 'p-img3-file'].forEach(id => {
      document.getElementById(id).value = '';
    });
    setPreview('p-img1-preview', product?.image_url);
    setPreview('p-img2-preview', product?.image_url_2);
    setPreview('p-img3-preview', product?.image_url_3);
    document.getElementById('modal-error').style.display = 'none';
    modal.style.display = 'flex';
  }

  document.getElementById('modal-cancel').addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

  document.getElementById('add-product-btn')?.addEventListener('click', () => openModal());

  async function uploadField(fileInputId, hiddenId, folder) {
    const fileInput = document.getElementById(fileInputId);
    const hidden = document.getElementById(hiddenId);
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      if (file.size > 2 * 1024 * 1024) throw new Error(`${file.name} exceeds 2MB limit.`);
      hidden.value = await uploadImage(file, folder);
    }
    return hidden.value.trim();
  }

  modalForm.addEventListener('submit', async e => {
    e.preventDefault();
    const saveBtn = document.getElementById('modal-save');
    saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026';
    const errEl = document.getElementById('modal-error');
    errEl.style.display = 'none';

    const id = document.getElementById('p-id').value;
    const folder = id || `new-${Date.now()}`;

    try {
      const image_url   = await uploadField('p-img1-file', 'p-img1', folder);
      const image_url_2 = await uploadField('p-img2-file', 'p-img2', folder);
      const image_url_3 = await uploadField('p-img3-file', 'p-img3', folder);

      if (!image_url) throw new Error('Image 1 is required.');

      const selectedCats = [];
      document.querySelectorAll('#p-categories input[type="checkbox"]:checked').forEach(cb => {
        selectedCats.push(cb.value);
      });
      if (!selectedCats.length) throw new Error('Select at least one category.');
      const payload = {
        title:           document.getElementById('p-title').value.trim(),
        description:     document.getElementById('p-desc').value.trim(),
        price:           parseFloat(document.getElementById('p-price').value),
        category:        selectedCats,
        stock:           parseInt(document.getElementById('p-stock').value) || 0,
        weight_kg:       parseFloat(document.getElementById('p-weight').value) || 0,
        discount_percent: parseInt(document.getElementById('p-discount').value) || 0,
        featured:        document.getElementById('p-featured').checked,
        image_url,
        image_url_2: image_url_2 || null,
        image_url_3: image_url_3 || null,
      };

      const productResult = id ? await updateProduct(id, payload) : await createProduct(payload);
      const savedId = id || productResult?.id || productResult?.[0]?.id;
      syncVariantsFromDom();
      if (savedId) {
        const existingVariants = await getProductVariants(savedId);
        const existingIds = new Set(existingVariants.map(v => v.id));
        const updatedIds = new Set();
        for (const v of currentVariants) {
          if (v.id) {
            updatedIds.add(v.id);
            const data = {};
            if (v.size !== undefined) data.size = v.size || null;
            if (v.color !== undefined) data.color = v.color || null;
            if (v.price !== undefined) data.price = v.price || null;
            data.stock = v.stock;
            await updateVariant(v.id, data);
          } else {
            await createVariant({
              product_id: savedId,
              size: v.size || null,
              color: v.color || null,
              price: v.price || null,
              stock: v.stock,
            });
          }
        }
        for (const existing of existingVariants) {
          if (!updatedIds.has(existing.id)) {
            await deleteVariant(existing.id).catch(() => {});
          }
        }
      }
      modal.style.display = 'none';
      allProducts = [];
      productsPage = 1;
      loadProducts();
    } catch (err) {
      errEl.textContent = err.message || 'Save failed.';
      errEl.style.display = 'block';
    }
    saveBtn.disabled = false; saveBtn.textContent = 'Save';
  });

  // Variant Management
  let currentVariants = [];

  function renderVariants() {
    const list = document.getElementById('variants-list');
    const empty = document.getElementById('variants-empty');
    if (!currentVariants.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = currentVariants.map((v, i) => `
      <div class="variant-row" data-index="${i}">
        <input type="text" placeholder="Size (e.g. SH)" value="${esc(v.size || '')}" class="v-size" style="width:80px;" />
        <input type="text" placeholder="Color (e.g. Red)" value="${esc(v.color || '')}" class="v-color" style="width:80px;" />
        <input type="number" placeholder="Price" value="${v.price || ''}" class="v-price" style="width:70px;" />
        <input type="number" placeholder="Stock" value="${v.stock}" class="v-stock" style="width:60px;" />
        <button type="button" class="remove-variant" style="background:#c62828;color:#fff;border:none;border-radius:4px;padding:4px 8px;cursor:pointer;font-size:12px;">\u2715</button>
      </div>
    `).join('');

    list.querySelectorAll('.remove-variant').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.closest('.variant-row').dataset.index, 10);
        currentVariants.splice(idx, 1);
        renderVariants();
      });
    });
  }

  document.getElementById('add-variant-btn')?.addEventListener('click', () => {
    currentVariants.push({ size: '', color: '', price: '', stock: 0 });
    renderVariants();
  });

  function syncVariantsFromDom() {
    document.querySelectorAll('#variants-list .variant-row').forEach(row => {
      const idx = parseInt(row.dataset.index, 10);
      if (idx < 0 || idx >= currentVariants.length) return;
      currentVariants[idx].size = row.querySelector('.v-size').value;
      currentVariants[idx].color = row.querySelector('.v-color').value;
      currentVariants[idx].price = row.querySelector('.v-price').value;
      currentVariants[idx].stock = parseInt(row.querySelector('.v-stock').value) || 0;
    });
  }

  async function loadVariants(productId) {
    if (!productId) { currentVariants = []; renderVariants(); return; }
    const variants = await getProductVariants(productId);
    currentVariants = variants.map(v => ({ id: v.id, size: v.size, color: v.color, price: v.price, stock: v.stock }));
    renderVariants();
  }

  const origOpenModal = openModal;
  openModal = function(product = null) {
    origOpenModal(product);
    loadVariants(product?.id || null);
  };

  const PRODS_PER_PAGE = 10;
  let productsPage = 1;
  let allProducts = [];

  function getProductFilterState() {
    return {
      category: document.getElementById('filter-category')?.value || '',
      stock: document.getElementById('filter-stock')?.value || '',
      discounted: document.getElementById('filter-discount')?.dataset.active === 'true',
      hasVariants: document.getElementById('filter-variants')?.dataset.active === 'true',
    };
  }

  async function loadProducts() {
    clearCache('products');
    productsTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';

    if (!allProducts.length) {
      allProducts = await getProducts({ limit: 1000 });
    }

    const filterState = getProductFilterState();
    let filtered = [...allProducts];
    if (filterState.category) filtered = filtered.filter(p => parseCats(p.category).some(c => c.toLowerCase() === filterState.category.toLowerCase()));
    if (filterState.stock === 'in-stock') filtered = filtered.filter(p => (p.stock ?? 0) > 0);
    if (filterState.stock === 'out-of-stock') filtered = filtered.filter(p => (p.stock ?? 0) <= 0);
    if (filterState.discounted) filtered = filtered.filter(p => (p.discount_percent || 0) > 0);
    if (filterState.hasVariants) {
      const results = await Promise.all(filtered.map(async p => {
        try {
          const v = await getProductVariants(p.id);
          return { id: p.id, has: v.length > 0, variants: v };
        } catch { return { id: p.id, has: false, variants: [] }; }
      }));
      const variantMap = {};
      results.forEach(r => { variantMap[r.id] = r.variants; });
      filtered = filtered.filter(p => variantMap[p.id]?.length > 0);
      window._prodVariants = variantMap;
    } else {
      window._prodVariants = {};
    }

    const totalFiltered = filtered.length;
    const totalPages = Math.ceil(totalFiltered / PRODS_PER_PAGE) || 1;
    if (productsPage > totalPages) productsPage = 1;

    const pageProducts = filtered.slice((productsPage - 1) * PRODS_PER_PAGE, productsPage * PRODS_PER_PAGE);

    if (!pageProducts.length) {
      productsTable.innerHTML = '<p>No products match filters.</p>';
      if (totalFiltered > 0) {
        productsTable.innerHTML += `<div class="pagination"><span class="page-info">Page ${productsPage} of ${totalPages}</span></div>`;
      }
      return;
    }

    let variantCache = window._prodVariants || {};
    if (!filterState.hasVariants) {
      const needFetch = pageProducts.filter(p => !variantCache[p.id]);
      if (needFetch.length) {
        const fetches = await Promise.all(needFetch.map(async p => {
          try { return { id: p.id, v: await getProductVariants(p.id) }; }
          catch { return { id: p.id, v: [] }; }
        }));
        fetches.forEach(r => { variantCache[r.id] = r.v; });
        window._prodVariants = variantCache;
      }
    }

    productsTable.innerHTML = `
      <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Image</th><th>Title</th><th>Category</th><th>Price (Rs)</th><th>Discount</th><th>Stock</th><th>Featured</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pageProducts.map((p, i) => {
            const variants = variantCache[p.id] || [];
            const hasVar = variants.length > 0;
            let stockDisplay = (p.stock ?? 0).toString();
            if (hasVar) {
              const totalVarStock = variants.reduce((s, v) => s + (v.stock || 0), 0);
              const details = variants.map(v => `${v.size || ''}${v.size && v.color ? ' ' : ''}${v.color || ''}: ${v.stock || 0}`).join(', ');
              stockDisplay = `${totalVarStock} <span style="font-size:0.75rem;color:#888;">[${esc(details)}]</span>`;
            }
            return `
            <tr data-id="${p.id}" style="--i:${i}">
              <td><img src="${p.image_url || 'https://placehold.co/60x45?text=?'}" style="width:60px;height:45px;object-fit:cover;border-radius:4px;" /></td>
              <td>${esc(p.title)}</td>
              <td>${p.category ? displayCats(p.category) : '\u2013'}</td>
              <td>Rs ${Number(p.price).toLocaleString()}</td>
              <td>${p.discount_percent ? `${p.discount_percent}%` : '\u2013'}</td>
              <td>${stockDisplay}</td>
              <td style="text-align:center;font-size:1.1rem;">${p.featured ? '\u2B50' : '\u2013'}</td>
              <td class="action-cell">
                <button class="edit-btn" data-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;background:#caf300;color:#000;border:none;border-radius:6px;cursor:pointer;">Edit</button>
                <button class="delete-btn" data-id="${p.id}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Delete</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <div class="pagination">
        <button class="button page-btn" id="prods-prev" ${productsPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
        <span class="page-info">Page ${productsPage} of ${totalPages} (${totalFiltered} total)</span>
        <button class="button page-btn" id="prods-next" ${productsPage >= totalPages ? 'disabled' : ''}>Next \u2192</button>
      </div>
    `;

    productsTable.querySelectorAll('.edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = allProducts.find(x => x.id === btn.dataset.id);
        if (p) openModal(p);
      });
    });

    productsTable.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this product?')) return;
        await deleteProduct(btn.dataset.id);
        allProducts = [];
        productsPage = 1;
        loadProducts();
      });
    });

    document.getElementById('prods-prev')?.addEventListener('click', () => {
      if (productsPage > 1) { productsPage--; loadProducts(); }
    });
    document.getElementById('prods-next')?.addEventListener('click', () => {
      if (productsPage < totalPages) { productsPage++; loadProducts(); }
    });
  }

  document.getElementById('filter-category')?.addEventListener('change', () => { productsPage = 1; loadProducts(); });
  document.getElementById('filter-stock')?.addEventListener('change', () => { productsPage = 1; loadProducts(); });
  document.getElementById('filter-discount')?.addEventListener('click', function() {
    const active = this.dataset.active === 'true';
    this.dataset.active = active ? 'false' : 'true';
    this.classList.toggle('active', !active);
    productsPage = 1;
    loadProducts();
  });
  document.getElementById('filter-variants')?.addEventListener('click', function() {
    const active = this.dataset.active === 'true';
    this.dataset.active = active ? 'false' : 'true';
    this.classList.toggle('active', !active);
    productsPage = 1;
    loadProducts();
  });

  loadCategories();
  loadProducts();
}

// --- Orders ---
const ordersTable = document.getElementById('orders-table');
if (ordersTable) {
  const ORDERS_PER_PAGE = 10;
  let ordersPage = 1;
  let ordersStatusFilter = '';

  const FILTER_ORDER_STATUSES = ['', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'return_requested', 'returned'];

  let productImageMap = {};

  function renderItems(items) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return '<em>No items</em>';
    return arr.map(i => {
      const img = productImageMap[i.id] || 'https://placehold.co/40x40?text=';
      return `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #eee;">
        <img src="${img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;flex-shrink:0;" onerror="this.src='https://placehold.co/40x40?text=?'" />
        <span style="flex:1;">${esc(i.title)}${i.variant_label ? ' <span style="color:#888;">(' + esc(i.variant_label) + ')</span>' : ''} \u00d7 ${i.qty}</span>
        <span style="white-space:nowrap;">Rs ${(Number(i.price) * Number(i.qty)).toLocaleString()}</span>
      </div>`;
    }).join('');
  }

  function renderOrderFilters() {
    const filterBar = document.getElementById('order-filters');
    if (!filterBar) return;
    filterBar.innerHTML = FILTER_ORDER_STATUSES.map(s => `
      <button class="order-filter-btn ${ordersStatusFilter === s ? 'active' : ''}"
        data-status="${s}" style="text-transform:capitalize;">
        ${s || 'All'}
      </button>
    `).join('');
    filterBar.querySelectorAll('.order-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ordersStatusFilter = btn.dataset.status;
        ordersPage = 1;
        loadOrders();
      });
    });
  }

  async function loadOrders() {
    clearCache('products');
    ordersTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    renderOrderFilters();
    const filterOpts = ordersStatusFilter ? { status: ordersStatusFilter } : {};
    const [orders, count] = await Promise.all([
      getOrders({ limit: ORDERS_PER_PAGE, offset: (ordersPage - 1) * ORDERS_PER_PAGE, ...filterOpts }),
      getOrdersCount(filterOpts),
    ]);
    const totalPages = Math.ceil(count / ORDERS_PER_PAGE) || 1;

    if (!orders.length) { ordersTable.innerHTML = '<p>No orders yet.</p>'; return; }

    const [allProducts, allInvoices] = await Promise.all([getProducts(), getInvoices()]);
    productImageMap = {};
    allProducts.forEach(p => { productImageMap[p.id] = p.image_url; });
    const invoiceMap = {};
    allInvoices.forEach(inv => { invoiceMap[inv.order_id] = inv; });

    ordersTable.innerHTML = `
      <div class="admin-table-wrap">
      <table class="admin-table-wide">
        <thead>
          <tr>
            <th style="width:32px;"></th>
            <th>Order ID</th><th>Date</th><th>Customer</th><th>Phone</th><th>Address</th><th>Total (Rs)</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map((o, i) => {
            const inv = invoiceMap[o.id];
            const docData = { ...o, invoice_number: inv ? inv.invoice_number : '' };
            return `
            <tr class="order-main-row" data-order-id="${o.id}" style="--i:${i}">
              <td style="text-align:center;">
                <button class="toggle-items-btn" data-id="${o.id}" title="Show items">+</button>
              </td>
              <td><code style="font-size:0.8rem;">${o.order_number || String(o.id).slice(0, 8)}</code></td>
              <td>${new Date(o.created_at).toLocaleDateString('en-PK')}</td>
              <td>${esc(o.customer_name || '\u2013')}</td>
              <td>${esc(o.customer_phone || '\u2013')}</td>
              <td class="address-cell">${esc(o.customer_address || '\u2013')}</td>
              <td>Rs ${Number(o.total || 0).toLocaleString()}</td>
              <td>
                ${o.status === 'return_requested' ? `
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="approve-return-btn" data-id="${o.id}" style="padding:4px 10px;font-size:0.8rem;background:#2e7d32;color:#fff;border:none;border-radius:6px;cursor:pointer;">Approve</button>
                    <button class="reject-return-btn" data-id="${o.id}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Reject</button>
                  </div>
                ` : `
                  <select class="status-select" data-id="${o.id}">
                    ${ORDER_STATUSES.map(s =>
                      `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s.replace(/_/g, ' ')}</option>`
                    ).join('')}
                  </select>
                `}
              </td>
              <td class="action-cell">
                <button class="order-download-invoice-btn" data-doc='${esc(JSON.stringify(docData))}' style="padding:4px 6px;font-size:0.7rem;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;">Invoice</button>
                <button class="order-download-challan-btn" data-doc='${esc(JSON.stringify(docData))}' style="padding:4px 6px;font-size:0.7rem;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;">Challan</button>
                <button class="delete-order-btn" data-id="${o.id}" style="background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;padding:4px 8px;font-size:0.75rem;">Delete</button>
              </td>
            </tr>
            <tr class="items-detail-row" id="items-${o.id}" style="display:none;">
              <td colspan="9" style="padding:0.75rem 1rem;background:#f5f5f5;">
                <div style="font-weight:600;margin-bottom:0.5rem;color:var(--admin-volt);">Order Items</div>
                ${renderItems(o.items)}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <div class="pagination">
        <button class="button page-btn" id="orders-prev" ${ordersPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
        <span class="page-info">Page ${ordersPage} of ${totalPages}</span>
        <button class="button page-btn" id="orders-next" ${ordersPage >= totalPages ? 'disabled' : ''}>Next \u2192</button>
      </div>
    `;

    ordersTable.querySelectorAll('.toggle-items-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const detailRow = document.getElementById(`items-${id}`);
        if (!detailRow) return;
        const isHidden = detailRow.style.display === 'none';
        detailRow.style.display = isHidden ? 'table-row' : 'none';
        btn.textContent = isHidden ? '\u2212' : '+';
      });
    });

    ordersTable.querySelectorAll('.status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        sel.disabled = true;
        try {
          await updateOrderStatus(sel.dataset.id, sel.value);
        } catch {
          alert('Failed to update status.');
        }
        sel.disabled = false;
      });
    });

    async function handleReturnAction(btn, newStatus, label) {
      btn.disabled = true;
      btn.textContent = `${label}\u2026`;
      try {
        await updateOrderStatus(btn.dataset.id, newStatus);
        btn.textContent = `${label}done \u2713`;
        setTimeout(() => loadOrders(), 1000);
      } catch {
        alert(`Failed to ${label.toLowerCase()} return.`);
        btn.disabled = false;
        btn.textContent = label;
      }
    }

    ordersTable.querySelectorAll('.approve-return-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Approve this return?')) return;
        handleReturnAction(btn, 'returned', 'Approve');
      });
    });

    ordersTable.querySelectorAll('.reject-return-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Reject this return request?')) return;
        handleReturnAction(btn, 'return_rejected', 'Reject');
      });
    });

    ordersTable.querySelectorAll('.delete-order-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Permanently delete this order?')) return;
        btn.disabled = true;
        btn.textContent = 'Deleting\u2026';
        try {
          await deleteOrder(btn.dataset.id);
          ordersPage = 1;
          loadOrders();
        } catch (err) {
          alert('Failed: ' + (err.message || 'unknown error'));
          btn.disabled = false;
          btn.textContent = 'Delete';
        }
      });
    });

    ordersTable.querySelectorAll('.order-download-invoice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          generateInvoice(JSON.parse(btn.dataset.doc));
        } catch (err) {
          alert('Failed to generate invoice: ' + err.message);
        }
      });
    });

    ordersTable.querySelectorAll('.order-download-challan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          generateDeliveryChallan(JSON.parse(btn.dataset.doc));
        } catch (err) {
          alert('Failed to generate challan: ' + err.message);
        }
      });
    });


    document.getElementById('orders-prev')?.addEventListener('click', () => {
      if (ordersPage > 1) { ordersPage--; loadOrders(); }
    });
    document.getElementById('orders-next')?.addEventListener('click', () => {
      if (ordersPage < totalPages) { ordersPage++; loadOrders(); }
    });
  }

  loadOrders();
}

// --- Revenue ---
const revenueContent = document.getElementById('revenue-content');
if (revenueContent) {
  const REVENUE_PER_PAGE = 20;
  let revenuePage = 1;
  let allLines = [];
  let allSummaryRows = [];
  let grandTotal = 0;
  let activeCount = 0;

  (async () => {
    const orders = await getOrders();
    const active = orders.filter(o => !REVENUE_STATUSES.has(o.status));
    activeCount = active.length;
    const lines = [];
    const summary = new Map();

    for (const order of active) {
      const items = Array.isArray(order.items) ? order.items : [];
      const date = new Date(order.created_at).toLocaleDateString('en-PK');
      const orderShort = String(order.id).slice(0, 8);

      for (const item of items) {
        const price = Number(item.price) || 0;
        const qty = Number(item.qty) || 1;
        const lineTotal = price * qty;
        const title = item.title || 'Unknown';
        const variantLabel = item.variant_label || '';

        lines.push({ date, orderShort, title, variantLabel, price, qty, lineTotal });

        const key = `${title}::${variantLabel}::${price}`;
        const row = summary.get(key) || { title, price, qty: 0, revenue: 0 };
        row.qty += qty;
        row.revenue += lineTotal;
        summary.set(key, row);
      }
    }

    grandTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    allLines = lines;
    allSummaryRows = [...summary.values()].sort((a, b) => b.revenue - a.revenue);

    renderRevenue();
    setupRevenueChart(active);
  })();

  function renderRevenue() {
    if (!allLines.length) {
      revenueContent.innerHTML = '<p>No sales yet.</p>';
      return;
    }

    const totalItems = allLines.length;
    const totalPages = Math.ceil(totalItems / REVENUE_PER_PAGE) || 1;
    if (revenuePage > totalPages) revenuePage = totalPages;

    const pageLines = allLines.slice((revenuePage - 1) * REVENUE_PER_PAGE, revenuePage * REVENUE_PER_PAGE);

    revenueContent.innerHTML = `
      <div class="revenue-total-card">
        <h3>Rs ${grandTotal.toLocaleString()}</h3>
        <p>Total revenue (${activeCount} order${activeCount === 1 ? '' : 's'}, cancelled & returns excluded)</p>
      </div>

      <h3 class="admin-subtitle">Sales Detail</h3>
      <div class="admin-table-wrap">
      <table class="admin-table-wide">
        <thead>
          <tr>
            <th>Date</th><th>Order</th><th>Product</th><th>Unit Price</th><th>Qty</th><th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${pageLines.map((l, i) => `
            <tr style="--i:${i}">
              <td>${l.date}</td>
              <td><code>${l.orderShort}</code></td>
              <td>${esc(l.title)}${l.variantLabel ? ' <span style="color:#888;font-size:0.8rem;">(' + esc(l.variantLabel) + ')</span>' : ''}</td>
              <td>Rs ${l.price.toLocaleString()}</td>
              <td>${l.qty}</td>
              <td><strong>Rs ${l.lineTotal.toLocaleString()}</strong></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right;font-weight:600;">Grand Total</td>
            <td><strong>Rs ${grandTotal.toLocaleString()}</strong></td>
          </tr>
        </tfoot>
      </table>
      </div>
      <div class="pagination">
        <button class="button page-btn" id="revenue-prev" ${revenuePage <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
        <span class="page-info">Page ${revenuePage} of ${totalPages} (${totalItems} total)</span>
        <button class="button page-btn" id="revenue-next" ${revenuePage >= totalPages ? 'disabled' : ''}>Next \u2192</button>
      </div>

      <h3 class="admin-subtitle">By Product &amp; Price</h3>
      <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Product</th><th>Unit Price</th><th>Qty Sold</th><th>Total Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${allSummaryRows.map((r, i) => `
            <tr style="--i:${i}">
              <td>${esc(r.title)}</td>
              <td>Rs ${r.price.toLocaleString()}</td>
              <td>${r.qty}</td>
              <td><strong>Rs ${r.revenue.toLocaleString()}</strong></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
    `;
  }

  function setupRevenueChart(activeOrders) {
    const chartCanvas = document.getElementById('revenue-chart-canvas');
    if (!chartCanvas || typeof Chart === 'undefined') return;

    let chartInstance = null;

    function buildChartData(days) {
      const labels = [];
      const values = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }));
        const dayOrders = activeOrders.filter(o => {
          const t = new Date(o.created_at).getTime();
          return t >= d.getTime() && t < d.getTime() + 86400000;
        });
        values.push(dayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0));
      }
      return { labels, values };
    }

    function renderChart(days) {
      const { labels, values } = buildChartData(days);
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(chartCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Revenue (Rs)',
            data: values,
            backgroundColor: 'rgba(202, 243, 0, 0.5)',
            borderColor: '#caf300',
            borderWidth: 1,
            borderRadius: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { callback: v => `Rs ${v.toLocaleString()}` } },
            x: { grid: { display: false } },
          },
        },
      });
    }

    renderChart(7);

    document.getElementById('revenue-chart-7d')?.addEventListener('click', () => {
      document.querySelectorAll('#revenue-chart-7d, #revenue-chart-30d').forEach(b => b.classList.remove('active'));
      document.getElementById('revenue-chart-7d').classList.add('active');
      renderChart(7);
    });
    document.getElementById('revenue-chart-30d')?.addEventListener('click', () => {
      document.querySelectorAll('#revenue-chart-7d, #revenue-chart-30d').forEach(b => b.classList.remove('active'));
      document.getElementById('revenue-chart-30d').classList.add('active');
      renderChart(30);
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.id === 'revenue-prev') { if (revenuePage > 1) { revenuePage--; renderRevenue(); } }
    if (e.target.id === 'revenue-next') {
      const totalPages = Math.ceil(allLines.length / REVENUE_PER_PAGE) || 1;
      if (revenuePage < totalPages) { revenuePage++; renderRevenue(); }
    }
  });
}

// --- Reviews ---
const reviewsTable = document.getElementById('reviews-table');
if (reviewsTable) {
  const REVIEWS_PER_PAGE = 10;
  let reviewsPage = 1;
  let allReviews = [];

  async function loadReviews() {
    clearCache('reviews');
    reviewsTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    if (!allReviews.length) {
      allReviews = await getAllReviews();
    }

    if (!allReviews.length) {
      reviewsTable.innerHTML = '<p>No reviews yet.</p>';
      return;
    }

    const totalItems = allReviews.length;
    const totalPages = Math.ceil(totalItems / REVIEWS_PER_PAGE) || 1;
    if (reviewsPage > totalPages) reviewsPage = totalPages;

    const pageReviews = allReviews.slice((reviewsPage - 1) * REVIEWS_PER_PAGE, reviewsPage * REVIEWS_PER_PAGE);

    reviewsTable.innerHTML = `
      <div class="admin-table-wrap">
      <table class="admin-table-reviews">
        <thead>
          <tr>
            <th>Product</th><th>Author</th><th>Rating</th><th>Review</th><th>Date</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pageReviews.map((r, i) => `
            <tr data-id="${r.id}" style="--i:${i}">
              <td>
                ${r.pinned ? '<span class="pin-badge">Pinned</span><br/>' : ''}
                ${esc(r.products?.title || '\u2013')}
              </td>
              <td>${esc(r.author_name)}</td>
              <td><span class="rating-stars">${stars(r.rating)}</span></td>
              <td class="review-comment-cell">${esc(r.comment)}</td>
              <td>${new Date(r.created_at).toLocaleDateString('en-PK')}</td>
              <td class="action-cell">
                <button class="pin-btn" data-id="${r.id}" data-pinned="${r.pinned}" style="padding:4px 10px;font-size:0.8rem;background:#caf300;color:#000;border:none;border-radius:6px;cursor:pointer;">
                  ${r.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button class="delete-review-btn" data-id="${r.id}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
      <div class="pagination">
        <button class="button page-btn" id="reviews-prev" ${reviewsPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
        <span class="page-info">Page ${reviewsPage} of ${totalPages} (${totalItems} total)</span>
        <button class="button page-btn" id="reviews-next" ${reviewsPage >= totalPages ? 'disabled' : ''}>Next \u2192</button>
      </div>
    `;

    reviewsTable.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await setReviewPinned(btn.dataset.id, btn.dataset.pinned !== 'true');
          allReviews = [];
          reviewsPage = 1;
          loadReviews();
        } catch {
          alert('Failed to update pin status.');
          btn.disabled = false;
        }
      });
    });

    reviewsTable.querySelectorAll('.delete-review-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this review permanently?')) return;
        btn.disabled = true;
        try {
          await deleteReview(btn.dataset.id);
          allReviews = [];
          reviewsPage = 1;
          loadReviews();
        } catch {
          alert('Failed to delete review.');
          btn.disabled = false;
        }
      });
    });
  }

  loadReviews();

  document.addEventListener('click', (e) => {
    if (e.target.id === 'reviews-prev') { if (reviewsPage > 1) { reviewsPage--; loadReviews(); } }
    if (e.target.id === 'reviews-next') {
      const totalPages = Math.ceil(allReviews.length / REVIEWS_PER_PAGE) || 1;
      if (reviewsPage < totalPages) { reviewsPage++; loadReviews(); }
    }
  });
}

// --- Coupons ---
const couponsTable = document.getElementById('coupons-table');
if (couponsTable) {
  const COUPONS_PER_PAGE = 10;
  let couponsPage = 1;
  let allCoupons = [];

  async function loadCoupons() {
    clearCache('coupons');
    couponsTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    if (!allCoupons.length) {
      allCoupons = await getCoupons();
    }

    if (!allCoupons.length) {
      couponsTable.innerHTML = '<p>No coupons yet. Create one above.</p>';
      return;
    }

    const totalItems = allCoupons.length;
    const totalPages = Math.ceil(totalItems / COUPONS_PER_PAGE) || 1;
    if (couponsPage > totalPages) couponsPage = totalPages;

    const pageCoupons = allCoupons.slice((couponsPage - 1) * COUPONS_PER_PAGE, couponsPage * COUPONS_PER_PAGE);

    couponsTable.innerHTML = `
      <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Code</th><th>Discount</th><th>Uses</th><th>Expires</th><th>Active</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${pageCoupons.map((c, i) => `
            <tr style="--i:${i}">
              <td><strong>${esc(c.code)}</strong></td>
              <td>${c.discount_percent}%</td>
              <td>${c.used_count}${c.max_uses > 0 ? ` / ${c.max_uses}` : ' / \u221e'}</td>
              <td>${c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-PK') : '\u2013'}</td>
              <td>${c.is_active ? '\u2713' : '\u2717'}</td>
              <td class="action-cell">
                <button class="delete-coupon-btn" data-id="${c.id}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
      <div class="pagination">
        <button class="button page-btn" id="coupons-prev" ${couponsPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
        <span class="page-info">Page ${couponsPage} of ${totalPages} (${totalItems} total)</span>
        <button class="button page-btn" id="coupons-next" ${couponsPage >= totalPages ? 'disabled' : ''}>Next \u2192</button>
      </div>
    `;

    couponsTable.querySelectorAll('.delete-coupon-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this coupon?')) return;
        btn.disabled = true;
        try {
          await deleteCoupon(btn.dataset.id);
          allCoupons = [];
          couponsPage = 1;
          loadCoupons();
        } catch { btn.disabled = false; }
      });
    });
  }

  loadCoupons();

  document.addEventListener('click', (e) => {
    if (e.target.id === 'coupons-prev') { if (couponsPage > 1) { couponsPage--; loadCoupons(); } }
    if (e.target.id === 'coupons-next') {
      const totalPages = Math.ceil(allCoupons.length / COUPONS_PER_PAGE) || 1;
      if (couponsPage < totalPages) { couponsPage++; loadCoupons(); }
    }
  });

  document.getElementById('coupon-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('create-coupon-btn');
    const msg = document.getElementById('coupon-form-msg');
    btn.disabled = true; btn.textContent = 'Creating\u2026'; msg.style.display = 'none';
    try {
      const data = {
        code: document.getElementById('c-code').value.trim().toUpperCase(),
        discount_percent: parseInt(document.getElementById('c-discount').value),
        max_uses: parseInt(document.getElementById('c-max-uses').value) || 0,
      };
      const expires = document.getElementById('c-expires').value;
      if (expires) data.expires_at = new Date(expires).toISOString();
      await createCoupon(data);
      e.target.reset();
      allCoupons = [];
      couponsPage = 1;
      loadCoupons();
    } catch (err) {
      msg.textContent = err.message || 'Failed to create coupon.';
      msg.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Create Coupon';
  });
}

// --- Categories ---
const categoriesTable = document.getElementById('categories-table');
if (categoriesTable) {
  let allCatsArr = [];
  let dragRow = null;

  async function loadAdminCategories() {
    clearCache('categories');
    categoriesTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    try {
      allCatsArr = await getCategories();
    } catch {
      categoriesTable.innerHTML = '<p>Failed to load categories.</p>';
      return;
    }
    if (!allCatsArr.length) {
      categoriesTable.innerHTML = '<p>No categories yet. Add one above.</p>';
      return;
    }

    categoriesTable.innerHTML = `
      <p style="font-size:0.85rem;color:#888;margin-bottom:0.75rem;">Drag rows to reorder categories.</p>
      <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:2rem"></th><th>Name</th><th>Sort Order</th><th>Created</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="cats-tbody">
          ${allCatsArr.map((c, i) => `
            <tr data-cat-id="${c.id}" draggable="true" style="cursor:grab;--i:${i}">
              <td style="text-align:center;color:#888;font-size:18px;cursor:grab;">⠿</td>
              <td><strong>${esc(c.name)}</strong></td>
              <td>${c.sort_order ?? 0}</td>
              <td>${c.created_at ? new Date(c.created_at).toLocaleDateString('en-PK') : '\u2013'}</td>
              <td class="action-cell">
                <button class="delete-cat-btn" data-id="${c.id}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
    `;

    categoriesTable.querySelectorAll('.delete-cat-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete category?')) return;
        btn.disabled = true;
        try {
          await deleteCategory(btn.dataset.id);
          allCatsArr = [];
          loadAdminCategories();
          loadCategories();
        } catch { btn.disabled = false; }
      });
    });

    const tbody = document.getElementById('cats-tbody');
    if (!tbody) return;

    tbody.addEventListener('dragstart', (e) => {
      dragRow = e.target.closest('tr');
      if (!dragRow) return;
      dragRow.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });

    tbody.addEventListener('dragend', (e) => {
      const row = e.target.closest('tr');
      if (row) row.style.opacity = '1';
      dragRow = null;
    });

    tbody.addEventListener('dragover', (e) => {
      e.preventDefault();
      const row = e.target.closest('tr');
      if (!row || row === dragRow) return;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      tbody.insertBefore(dragRow, e.clientY < midY ? row : row.nextSibling);
    });

    tbody.addEventListener('drop', async (e) => {
      e.preventDefault();
      const rows = tbody.querySelectorAll('tr');
      const newOrder = Array.from(rows).map(r => r.dataset.catId).filter(Boolean);
      try {
        await Promise.all(newOrder.map((id, idx) => updateCategory(id, { sort_order: idx + 1 })));
        clearCache('categories');
        loadCategories();
      } catch (err) {
        console.error('Failed to save category order:', err);
      }
      loadAdminCategories();
    });
  }

  loadAdminCategories();

  document.getElementById('category-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('create-category-btn');
    const msg = document.getElementById('category-form-msg');
    btn.disabled = true; btn.textContent = 'Adding\u2026'; msg.style.display = 'none';
    try {
      const data = {
        name: document.getElementById('c-name').value.trim(),
        sort_order: (allCatsArr.length ? Math.max(...allCatsArr.map(c => c.sort_order ?? 0)) : 0) + 1,
      };
      await createCategory(data);
      e.target.reset();
      allCatsArr = [];
      loadAdminCategories();
      loadCategories();
    } catch (err) {
      msg.textContent = err.message || 'Failed to create category.';
      msg.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Add Category';
  });
}

// --- Hero Section ---
const heroCurrent = document.getElementById('hero-current');
const heroForm = document.getElementById('hero-form');
if (heroForm) {
  function showHeroPreview(hero) {
    if (!heroCurrent) return;
    if (!hero) {
      heroCurrent.innerHTML = '<div style="background:#fafafa;border-radius:12px;padding:2rem;text-align:center;border:1px solid #e0e0e0;"><p style="color:#888;">No hero image set yet. Upload one below.</p></div>';
      return;
    }
    heroCurrent.innerHTML = `
      <div style="background:#fafafa;border-radius:12px;padding:1.5rem;border:1px solid #e0e0e0;">
        <h3 style="margin-bottom:0.75rem;font-size:1rem;color:var(--admin-volt);">Current Hero Image</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;">
          <div>
            <p style="font-size:0.82rem;color:#888;margin-bottom:0.35rem;">Desktop</p>
            <div style="border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;background:#fff;">
              <img src="${hero.image_url}" alt="Desktop hero" style="display:block;width:100%;height:auto;aspect-ratio:192/100;object-fit:cover;" />
            </div>
          </div>
          ${hero.mobile_image_url ? `
          <div>
            <p style="font-size:0.82rem;color:#888;margin-bottom:0.35rem;">Mobile</p>
            <div style="border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;background:#fff;max-width:200px;">
              <img src="${hero.mobile_image_url}" alt="Mobile hero" style="display:block;width:100%;height:auto;aspect-ratio:75/133;object-fit:cover;" />
            </div>
          </div>` : ''}
        </div>
      </div>
    `;
  }

  (async () => {
    const active = await getActiveHeroImage();
    showHeroPreview(active);
  })();

  heroForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('hero-save-btn');
    const msg = document.getElementById('hero-form-msg');
    btn.disabled = true; btn.textContent = 'Saving\u2026'; msg.style.display = 'none';

    try {
      const desktopFile = document.getElementById('hero-desktop-file');
      const mobileFile = document.getElementById('hero-mobile-file');
      const desktopHidden = document.getElementById('hero-desktop-url');
      const mobileHidden = document.getElementById('hero-mobile-url');

      if (desktopFile.files && desktopFile.files[0]) {
        const file = desktopFile.files[0];
        if (file.size > 2 * 1024 * 1024) throw new Error('Desktop image exceeds 2MB limit.');
        desktopHidden.value = await uploadImage(file, 'hero');
      }
      if (mobileFile.files && mobileFile.files[0]) {
        const file = mobileFile.files[0];
        if (file.size > 2 * 1024 * 1024) throw new Error('Mobile image exceeds 2MB limit.');
        mobileHidden.value = await uploadImage(file, 'hero');
      }

      if (!desktopHidden.value.trim()) throw new Error('Desktop image is required.');

      await setHeroImage(desktopHidden.value.trim(), mobileHidden.value.trim() || null);

      document.getElementById('hero-desktop-preview').innerHTML = '';
      document.getElementById('hero-mobile-preview').innerHTML = '';
      desktopFile.value = '';
      mobileFile.value = '';
      desktopHidden.value = '';
      mobileHidden.value = '';

      const updated = await getActiveHeroImage();
      showHeroPreview(updated);
      msg.textContent = 'Hero image updated successfully!';
      msg.style.color = '#66bb6a';
      msg.style.display = 'block';
      setTimeout(() => { msg.style.display = 'none'; }, 3000);
    } catch (err) {
      msg.textContent = err.message || 'Failed to save hero image.';
      msg.style.color = '#ef5350';
      msg.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = 'Save Hero Image';
  });

  ['hero-desktop-file', 'hero-mobile-file'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', function() {
      const preview = document.getElementById(id.replace('-file', '-preview'));
      const hidden = document.getElementById(id.replace('-file', '-url'));
      if (this.files && this.files[0]) {
        const reader = new FileReader();
        reader.onload = e => {
          preview.innerHTML = `<img src="${e.target.result}" alt="Preview" />`;
        };
        reader.readAsDataURL(this.files[0]);
      } else {
        preview.innerHTML = '';
        hidden.value = '';
      }
    });
  });
}

// --- Invoices ---
const invoicesTable = document.getElementById('invoices-table');
if (invoicesTable) {
  const INVOICES_PER_PAGE = 10;
  let invoicesPage = 1;
  let invoicesStatusFilter = '';

  const FILTER_INVOICE_STATUSES = ['', 'active', 'cancelled'];

  function renderInvoiceFilters() {
    const filterBar = document.getElementById('invoice-filters');
    if (!filterBar) return;
    filterBar.innerHTML = FILTER_INVOICE_STATUSES.map(s => `
      <button class="invoice-filter-btn ${invoicesStatusFilter === s ? 'active' : ''}"
        data-status="${s}" style="text-transform:capitalize;">
        ${s || 'All'}
      </button>
    `).join('');
    filterBar.querySelectorAll('.invoice-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        invoicesStatusFilter = btn.dataset.status;
        invoicesPage = 1;
        loadInvoices();
      });
    });
  }

  async function loadInvoices() {
    invoicesTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    renderInvoiceFilters();
    const filterOpts = invoicesStatusFilter ? { status: invoicesStatusFilter } : {};
    const [invoices, count, allOrders] = await Promise.all([
      getInvoices({ limit: INVOICES_PER_PAGE, offset: (invoicesPage - 1) * INVOICES_PER_PAGE, ...filterOpts }),
      getInvoicesCount(filterOpts),
      getOrders(),
    ]);
    const totalPages = Math.ceil(count / INVOICES_PER_PAGE) || 1;
    const orderNumMap = {};
    allOrders.forEach(o => { orderNumMap[o.id] = o.order_number; });

    if (!invoices.length) { invoicesTable.innerHTML = '<p>No invoices yet.</p>'; return; }

    invoicesTable.innerHTML = `
      <div class="admin-table-wrap">
      <table class="admin-table-wide">
        <thead>
          <tr>
            <th>Invoice #</th><th>Date</th><th>Customer</th><th>Phone</th><th>Total (Rs)</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${invoices.map((inv, i) => {
            const orderNum = orderNumMap[inv.order_id] || inv.order_id;
            const data = { ...inv, order_number: orderNum };
            return `
            <tr style="--i:${i}">
              <td><code style="font-size:0.8rem;">${esc(inv.invoice_number)}</code></td>
              <td>${new Date(inv.created_at).toLocaleDateString('en-PK')}</td>
              <td>${esc(inv.customer_name || '\u2013')}</td>
              <td>${esc(inv.customer_phone || '\u2013')}</td>
              <td>Rs ${Number(inv.total || 0).toLocaleString()}</td>
              <td>
                <span style="padding:4px 8px;border-radius:4px;font-size:0.8rem;font-weight:600;${
                  inv.status === 'active' ? 'background:#d4edda;color:#155724;' :
                  inv.status === 'cancelled' ? 'background:#f8d7da;color:#721c24;' :
                  'background:#f0f0f0;color:#888;'
                }">${inv.status.replace('_', ' ')}</span>
              </td>
              <td class="action-cell">
                <button class="inv-download-invoice-btn" data-invoice='${esc(JSON.stringify(data))}' style="padding:4px 8px;font-size:0.75rem;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;">Invoice</button>
                <button class="inv-download-challan-btn" data-invoice='${esc(JSON.stringify(data))}' style="padding:4px 8px;font-size:0.75rem;background:#000;color:#fff;border:none;border-radius:6px;cursor:pointer;">Challan</button>
                ${inv.status === 'active' ? `
                  <button class="cancel-invoice-btn" data-id="${inv.id}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Cancel</button>
                ` : ''}
                <button class="delete-invoice-btn" data-id="${inv.id}" style="padding:4px 10px;font-size:0.8rem;background:#555;color:#fff;border:none;border-radius:6px;cursor:pointer;">Delete</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      </div>
      <div class="pagination">
        <button class="button page-btn" id="inv-prev" ${invoicesPage <= 1 ? 'disabled' : ''}>\u2190 Prev</button>
        <span class="page-info">Page ${invoicesPage} of ${totalPages} (${count} total)</span>
        <button class="button page-btn" id="inv-next" ${invoicesPage >= totalPages ? 'disabled' : ''}>Next \u2192</button>
      </div>
    `;

    invoicesTable.querySelectorAll('.inv-download-invoice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          generateInvoice(JSON.parse(btn.dataset.invoice));
        } catch (err) {
          alert('Failed to generate invoice: ' + err.message);
        }
      });
    });

    invoicesTable.querySelectorAll('.inv-download-challan-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          generateDeliveryChallan(JSON.parse(btn.dataset.invoice));
        } catch (err) {
          alert('Failed to generate challan: ' + err.message);
        }
      });
    });

    invoicesTable.querySelectorAll('.cancel-invoice-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Cancel this invoice?')) return;
        try {
          await cancelInvoiceByAdmin(btn.dataset.id);
          invoicesPage = 1;
          loadInvoices();
        } catch (err) {
          alert('Failed: ' + (err.message || 'unknown error'));
        }
      });
    });

    invoicesTable.querySelectorAll('.delete-invoice-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this invoice?')) return;
        try {
          await deleteInvoice(btn.dataset.id);
          invoicesPage = 1;
          loadInvoices();
        } catch (err) {
          alert('Failed: ' + (err.message || 'unknown error'));
        }
      });
    });

    document.getElementById('inv-prev')?.addEventListener('click', () => {
      if (invoicesPage > 1) { invoicesPage--; loadInvoices(); }
    });
    document.getElementById('inv-next')?.addEventListener('click', () => {
      if (invoicesPage < totalPages) { invoicesPage++; loadInvoices(); }
    });
  }

  loadInvoices();
}

// --- Charges ---
const chargesTable = document.getElementById('charges-table');
if (chargesTable) {
  let allCharges = [];
  let editChargeKey = null;

  async function loadCharges() {
    clearCache('charges');
    chargesTable.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    allCharges = await getCharges();

    if (!allCharges.length) {
      chargesTable.innerHTML = '<p>No charges yet. Add one above.</p>';
      return;
    }

    chargesTable.innerHTML = `
      <div class="admin-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Key</th><th>Label</th><th>Value</th><th>Type</th><th>Last Updated</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${allCharges.map((c, i) => `
            <tr style="--i:${i}">
              <td><code style="font-size:0.8rem;">${esc(c.key)}</code></td>
              <td><strong>${esc(c.label)}</strong></td>
              <td>${c.type === 'percentage' ? c.value + '%' : 'Rs ' + Number(c.value).toLocaleString()}</td>
              <td>${c.type === 'percentage' ? 'Percentage' : 'Fixed'}</td>
              <td style="font-size:0.8rem;color:#888;">${c.updated_at ? new Date(c.updated_at).toLocaleString('en-PK') : '\u2013'}</td>
              <td class="action-cell">
                <button class="edit-charge-btn" data-key="${esc(c.key)}" data-label="${esc(c.label)}" data-value="${c.value}" data-type="${c.type}" style="padding:4px 10px;font-size:0.8rem;background:#caf300;color:#000;border:none;border-radius:6px;cursor:pointer;">Edit</button>
                <button class="delete-charge-btn" data-key="${esc(c.key)}" style="padding:4px 10px;font-size:0.8rem;background:#c62828;color:#fff;border:none;border-radius:6px;cursor:pointer;">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      </div>
    `;

    chargesTable.querySelectorAll('.edit-charge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        editChargeKey = btn.dataset.key;
        document.getElementById('c-key').value = btn.dataset.key;
        document.getElementById('c-key').readOnly = true;
        document.getElementById('c-label').value = btn.dataset.label;
        document.getElementById('c-value').value = btn.dataset.value;
        document.getElementById('c-type').value = btn.dataset.type;
        document.getElementById('save-charge-btn').textContent = 'Update';
        document.getElementById('cancel-charge-btn').style.display = '';
      });
    });

    chargesTable.querySelectorAll('.delete-charge-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this charge?')) return;
        btn.disabled = true;
        try {
          await deleteCharge(btn.dataset.key);
          loadCharges();
        } catch { btn.disabled = false; }
      });
    });
  }

  loadCharges();

  document.getElementById('cancel-charge-btn')?.addEventListener('click', () => {
    editChargeKey = null;
    document.getElementById('charge-form').reset();
    document.getElementById('c-key').readOnly = false;
    document.getElementById('c-type').value = 'fixed';
    document.getElementById('save-charge-btn').textContent = 'Save';
    document.getElementById('cancel-charge-btn').style.display = 'none';
    document.getElementById('charge-form-msg').style.display = 'none';
  });

  document.getElementById('charge-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('save-charge-btn');
    const msg = document.getElementById('charge-form-msg');
    btn.disabled = true; btn.textContent = 'Saving\u2026'; msg.style.display = 'none';
    try {
      const key = document.getElementById('c-key').value.trim();
      const data = {
        label: document.getElementById('c-label').value.trim(),
        value: parseFloat(document.getElementById('c-value').value) || 0,
        type: document.getElementById('c-type').value,
      };
      await upsertCharge(key, data);
      e.target.reset();
      document.getElementById('c-type').value = 'fixed';
      document.getElementById('c-key').readOnly = false;
      editChargeKey = null;
      btn.textContent = 'Save';
      document.getElementById('cancel-charge-btn').style.display = 'none';
      loadCharges();
    } catch (err) {
      msg.textContent = err.message || 'Failed to save charge.';
      msg.style.display = 'block';
    }
    btn.disabled = false; btn.textContent = editChargeKey ? 'Update' : 'Save';
  });
}

// --- Analytics ---
const analyticsContent = document.getElementById('analytics-content');
if (analyticsContent) {
  (async () => {
    analyticsContent.innerHTML = '<div class="admin-spinner">Loading\u2026</div>';
    try {
      const [products, orders, reviews] = await Promise.all([
        getProducts(), getOrders(), getAllReviews(),
      ]);

      const active = orders.filter(o => !REVENUE_STATUSES.has(o.status));
      const totalRevenue = active.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const totalProducts = products.length;
      const featuredProducts = products.filter(p => p.featured).length;
      const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
      const lowStock = products.filter(p => (p.stock ?? 0) > 0 && (p.stock ?? 0) <= 5).length;
      const outOfStock = products.filter(p => !(p.stock ?? 0)).length;
      const avgRating = reviews.length ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1) : 'N/A';
      const pendingOrders = countStatus(orders, 'pending');
      const returnRequests = countStatus(orders, 'return_requested');

      analyticsContent.innerHTML = `
        <div class="analytics-grid">
          <div class="analytics-card">
            <h3>${totalProducts}</h3>
            <p>Total Products</p>
          </div>
          <div class="analytics-card">
            <h3>${featuredProducts}</h3>
            <p>Featured Products</p>
          </div>
          <div class="analytics-card">
            <h3>${totalStock}</h3>
            <p>Total Stock Units</p>
          </div>
          <div class="analytics-card">
            <h3>${lowStock}</h3>
            <p>Low Stock Items (&le;5)</p>
          </div>
          <div class="analytics-card">
            <h3>${outOfStock}</h3>
            <p>Out of Stock</p>
          </div>
          <div class="analytics-card">
            <h3>${orders.length}</h3>
            <p>Total Orders</p>
          </div>
          <div class="analytics-card">
            <h3>${active.length}</h3>
            <p>Active Orders</p>
          </div>
          <div class="analytics-card">
            <h3>${pendingOrders}</h3>
            <p>Pending Orders</p>
          </div>
          <div class="analytics-card">
            <h3>${returnRequests}</h3>
            <p>Return Requests</p>
          </div>
          <div class="analytics-card">
            <h3>Rs ${totalRevenue.toLocaleString()}</h3>
            <p>Total Revenue</p>
          </div>
          <div class="analytics-card">
            <h3>${reviews.length}</h3>
            <p>Total Reviews</p>
          </div>
          <div class="analytics-card">
            <h3>${avgRating}</h3>
            <p>Avg Rating /5</p>
          </div>
        </div>
      `;
    } catch (err) {
      analyticsContent.innerHTML = `<p style="color:#ef5350;">Failed to load analytics: ${esc(err.message)}</p>`;
    }
  })();
}
