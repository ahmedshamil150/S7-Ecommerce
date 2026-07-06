const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function cacheKey(...args) {
  return args.join('::');
}

function cached(key, ttl = CACHE_TTL) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttl) {
    return entry.data;
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

export function clearCache(prefix) {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function headers() {
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

async function adminFetch({ path, method, body, prefer, upload }) {
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, method, body, prefer, upload }),
  });
  const text = await res.text();
  if (!res.ok) {
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    const msg = parsed.data?.message || parsed.data?.error || parsed.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return text ? JSON.parse(text) : {};
}

export async function getProducts({ limit, offset, featured, category } = {}) {
  if (!SUPABASE_URL) return [];
  const params = new URLSearchParams({ order: 'created_at.desc' });
  if (limit) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  if (featured != null) params.set('featured', `eq.${featured}`);
  if (category) params.set('category', `cs.{${category}}`);
  const key = cacheKey('products', params.toString());
  const hit = cached(key);
  if (hit) return hit;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${params}`, { headers: headers() });
  if (!res.ok) return [];
  const data = await res.json();
  setCache(key, data);
  return data;
}

export async function getProductsCount() {
  if (!SUPABASE_URL) return 0;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?select=id&limit=0`, {
    headers: { ...headers(), 'Prefer': 'count=exact' },
  });
  if (!res.ok) return 0;
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) : 0;
}

export async function getProductById(id) {
  if (!SUPABASE_URL) return null;
  const key = cacheKey('product', id);
  const hit = cached(key);
  if (hit) return hit;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}&limit=1`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json();
  const product = data[0] || null;
  setCache(key, product);
  return product;
}

export async function uploadImage(file, folder) {
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${folder}/${Date.now()}.${ext}`;

  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const result = await adminFetch({
    path: `/storage/v1/object/product-images/${path}`,
    method: 'POST',
    upload: { buffer, fileType: file.type },
  });

  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${path}`;
}

export async function createProduct(product) {
  const result = await adminFetch({
    path: '/rest/v1/products',
    method: 'POST',
    body: product,
    prefer: 'return=representation',
  });
  return result.data;
}

export async function updateProduct(id, product) {
  const result = await adminFetch({
    path: `/rest/v1/products?id=eq.${id}`,
    method: 'PATCH',
    body: product,
    prefer: 'return=representation',
  });
  return result.data;
}

export async function updateOrderStatus(id, status) {
  await adminFetch({
    path: `/rest/v1/orders?id=eq.${id}`,
    method: 'PATCH',
    body: { status },
    prefer: 'return=representation',
  });
}

export async function deleteProduct(id) {
  await adminFetch({
    path: `/rest/v1/products?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function getOrders({ limit, offset, status } = {}) {
  if (!SUPABASE_URL) return [];
  const params = new URLSearchParams({ order: 'created_at.desc' });
  if (limit) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  if (status) params.set('status', `eq.${status}`);
  const result = await adminFetch({
    path: `/rest/v1/orders?${params}`,
  });
  return result.data || [];
}

export async function getOrdersCount({ status } = {}) {
  if (!SUPABASE_URL) return 0;
  let path = '/rest/v1/orders?select=id&limit=0';
  if (status) path += `&status=eq.${status}`;
  const result = await adminFetch({
    path,
    prefer: 'count=exact',
  });
  return result.count ? parseInt(result.count, 10) : 0;
}

export async function deleteOrder(id) {
  await adminFetch({
    path: `/rest/v1/orders?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function createOrder(order) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
    method: 'POST',
    headers: { ...headers(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(order),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
}

export async function trackOrder(orderId, phone) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_order_status`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_order_id: orderId, p_phone: phone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function placeOrder(order, couponCode) {
  const body = {
    p_id: order.id,
    p_customer_name: order.customer_name,
    p_customer_phone: order.customer_phone,
    p_customer_address: order.customer_address,
    p_items: order.items,
    p_total: order.total,
    p_delivery_fee: order.delivery_fee || 0,
    p_tax_amount:   order.tax_amount || 0,
  };
  if (couponCode) body.p_coupon_code = couponCode;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/place_order`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function cancelOrder(orderId, phone) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/cancel_order`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_order_id: orderId, p_phone: phone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.details || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function requestReturn(orderId, phone) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/request_return`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_order_id: orderId, p_phone: phone }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.details || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getReviews(productId) {
  if (!SUPABASE_URL) return [];
  const key = cacheKey('reviews', productId);
  const hit = cached(key);
  if (hit) return hit;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/reviews?product_id=eq.${productId}&order=created_at.desc`,
    { headers: headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  setCache(key, data);
  return data;
}

export async function getAllReviews() {
  if (!SUPABASE_URL) return [];
  const result = await adminFetch({
    path: '/rest/v1/reviews?select=*,products(title)&order=pinned.desc,created_at.desc',
  });
  return result.data || [];
}

export async function createReview(review) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
    method: 'POST',
    headers: { ...headers(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(review),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
}

export async function deleteReview(id) {
  await adminFetch({
    path: `/rest/v1/reviews?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function getCoupons() {
  if (!SUPABASE_URL) return [];
  const result = await adminFetch({
    path: '/rest/v1/coupons?order=created_at.desc',
  });
  return result.data || [];
}

export async function createCoupon(data) {
  const result = await adminFetch({
    path: '/rest/v1/coupons',
    method: 'POST',
    body: data,
    prefer: 'return=representation',
  });
  return result.data;
}

export async function deleteCoupon(id) {
  await adminFetch({
    path: `/rest/v1/coupons?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function validateCoupon(code) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_coupon`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_code: code }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function setReviewPinned(id, pinned) {
  const result = await adminFetch({
    path: `/rest/v1/reviews?id=eq.${id}`,
    method: 'PATCH',
    body: { pinned },
    prefer: 'return=representation',
  });
  return result.data;
}

export async function getActiveHeroImage() {
  if (!SUPABASE_URL) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/hero_images?is_active=eq.true&limit=1`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

export async function getHeroImages() {
  if (!SUPABASE_URL) return [];
  const result = await adminFetch({
    path: '/rest/v1/hero_images?order=created_at.desc',
  });
  return result.data || [];
}

export async function setHeroImage(image_url, mobile_image_url) {
  const existing = await getHeroImages();
  for (const h of existing) {
    await adminFetch({
      path: `/rest/v1/hero_images?id=eq.${h.id}`,
      method: 'PATCH',
      body: { is_active: false },
    });
  }
  const result = await adminFetch({
    path: '/rest/v1/hero_images',
    method: 'POST',
    body: { image_url, mobile_image_url: mobile_image_url || null, is_active: true },
    prefer: 'return=representation',
  });
  return result.data;
}

export async function getProductVariants(productId) {
  if (!SUPABASE_URL) return [];
  const key = cacheKey('variants', productId);
  const hit = cached(key);
  if (hit) return hit;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/product_variants?product_id=eq.${productId}&order=created_at`,
    { headers: headers() }
  );
  if (!res.ok) return [];
  const data = await res.json();
  setCache(key, data);
  return data;
}

export async function createVariant(data) {
  const result = await adminFetch({
    path: '/rest/v1/product_variants',
    method: 'POST',
    body: data,
    prefer: 'return=representation',
  });
  return result.data;
}

export async function updateVariant(id, data) {
  const result = await adminFetch({
    path: `/rest/v1/product_variants?id=eq.${id}`,
    method: 'PATCH',
    body: data,
    prefer: 'return=representation',
  });
  return result.data;
}

export async function deleteVariant(id) {
  await adminFetch({
    path: `/rest/v1/product_variants?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function getCategories() {
  if (!SUPABASE_URL) return [];
  const key = cacheKey('categories');
  const hit = cached(key);
  if (hit) return hit;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/categories?order=sort_order.asc,name.asc`, { headers: headers() });
  if (!res.ok) return [];
  const data = await res.json();
  setCache(key, data);
  return data;
}

export async function createCategory(data) {
  const result = await adminFetch({
    path: '/rest/v1/categories',
    method: 'POST',
    body: data,
    prefer: 'return=representation',
  });
  return result.data;
}

export async function updateCategory(id, data) {
  await adminFetch({
    path: `/rest/v1/categories?id=eq.${id}`,
    method: 'PATCH',
    body: data,
  });
}

export async function deleteCategory(id) {
  await adminFetch({
    path: `/rest/v1/categories?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function getInvoices({ limit, offset, status } = {}) {
  if (!SUPABASE_URL) return [];
  const params = new URLSearchParams({ order: 'created_at.desc' });
  if (limit) params.set('limit', limit);
  if (offset != null) params.set('offset', offset);
  if (status) params.set('status', `eq.${status}`);
  const result = await adminFetch({
    path: `/rest/v1/invoices?${params}`,
  });
  return result.data || [];
}

export async function getInvoicesCount({ status } = {}) {
  if (!SUPABASE_URL) return 0;
  let path = '/rest/v1/invoices?select=id&limit=0';
  if (status) path += `&status=eq.${status}`;
  const result = await adminFetch({
    path,
    prefer: 'count=exact',
  });
  return result.count ? parseInt(result.count, 10) : 0;
}

export async function getInvoiceById(id) {
  if (!SUPABASE_URL) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${id}&limit=1`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

export async function getInvoiceByOrderId(orderId) {
  if (!SUPABASE_URL) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/invoices?order_id=eq.${orderId}&limit=1`, { headers: headers() });
  if (!res.ok) return null;
  const data = await res.json();
  return data[0] || null;
}

export async function deleteInvoice(id) {
  await adminFetch({
    path: `/rest/v1/invoices?id=eq.${id}`,
    method: 'DELETE',
  });
}

export async function cancelInvoiceByAdmin(id) {
  await adminFetch({
    path: `/rest/v1/invoices?id=eq.${id}`,
    method: 'PATCH',
    body: { status: 'cancelled' },
    prefer: 'return=representation',
  });
}

export async function getCharges() {
  if (!SUPABASE_URL) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/charges?order=key.asc`, { headers: headers() });
  if (!res.ok) return [];
  return res.json();
}

export async function upsertCharge(key, data) {
  const result = await adminFetch({
    path: `/rest/v1/charges?on_conflict=key`,
    method: 'POST',
    body: { key, ...data },
    prefer: 'resolution=merge-duplicates,return=representation',
  });
  return result.data;
}

export async function deleteCharge(key) {
  await adminFetch({
    path: `/rest/v1/charges?key=eq.${encodeURIComponent(key)}`,
    method: 'DELETE',
  });
}
