-- =============================================
-- S7 SPORTS - Full Database Migration
-- Run this in Supabase SQL Editor
-- Cricket equipment e-commerce store
-- =============================================

-- 0. Create products table
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  price           NUMERIC NOT NULL,
  category        TEXT[] DEFAULT '{}',
  stock           INTEGER NOT NULL DEFAULT 0,
  image_url       TEXT,
  image_url_2     TEXT,
  image_url_3     TEXT,
  discount_percent INT DEFAULT 0,
  featured        BOOLEAN DEFAULT false,
  weight_kg       NUMERIC DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read products" ON products;
CREATE POLICY "Anon can read products"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON products TO anon;

-- 1. Product variants (size/color/price/stock)
CREATE TABLE IF NOT EXISTS product_variants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size        TEXT,
  color       TEXT,
  price       NUMERIC,
  stock       INTEGER NOT NULL DEFAULT 0,
  sku         TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON product_variants(product_id);

ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read variants" ON product_variants;
CREATE POLICY "Allow anon read variants"
  ON product_variants FOR SELECT TO anon USING (true);

GRANT SELECT ON product_variants TO anon;

-- 2. Orders table
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     TEXT UNIQUE,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  items            JSONB NOT NULL,
  total            NUMERIC NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'return_requested', 'returned', 'return_declined')),
  coupon_code      TEXT,
  delivery_fee     NUMERIC DEFAULT 0,
  tax_amount       NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can insert orders" ON orders;
CREATE POLICY "Anon can insert orders"
  ON orders FOR INSERT
  TO anon
  WITH CHECK (true);

-- 3. Order tracking (secure: requires order ID + phone)
CREATE OR REPLACE FUNCTION get_order_status(p_order_id text, p_phone text)
RETURNS TABLE (
  id uuid,
  order_number text,
  created_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_address text,
  items jsonb,
  total numeric,
  status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, order_number, created_at, customer_name, customer_phone, customer_address, items, total, status
  FROM orders
  WHERE (id::text = p_order_id OR order_number = p_order_id)
    AND customer_phone = p_phone
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_order_status(text, text) TO anon;
GRANT EXECUTE ON FUNCTION get_order_status(text, text) TO authenticated;

-- 4. Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT NOT NULL,
  pinned      BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reviews_product_id_idx ON reviews(product_id);
CREATE INDEX IF NOT EXISTS reviews_created_at_idx ON reviews(created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_pinned_idx ON reviews(pinned DESC, created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read reviews" ON reviews;
DROP POLICY IF EXISTS "Anyone can post reviews" ON reviews;

CREATE POLICY "Anyone can read reviews"
  ON reviews FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can post reviews"
  ON reviews FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(author_name)) > 0
    AND char_length(trim(comment)) >= 10
    AND rating >= 1 AND rating <= 5
  );

GRANT SELECT, INSERT ON reviews TO anon;
GRANT SELECT, INSERT ON reviews TO authenticated;

-- 5. Coupons
CREATE TABLE IF NOT EXISTS coupons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT NOT NULL UNIQUE,
  discount_percent INT NOT NULL CHECK (discount_percent >= 1 AND discount_percent <= 100),
  max_uses         INT DEFAULT 0,
  used_count       INT DEFAULT 0,
  expires_at       TIMESTAMPTZ,
  is_active        BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read coupons" ON coupons;
CREATE POLICY "Anyone can read coupons"
  ON coupons FOR SELECT TO anon USING (true);

GRANT SELECT ON coupons TO anon;

-- 6. Categories
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE IF EXISTS categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_read_categories" ON categories;
CREATE POLICY "anon_read_categories" ON categories
  FOR SELECT USING (true);

GRANT SELECT ON categories TO anon;

-- Seed cricket categories
INSERT INTO categories (name, sort_order) VALUES
  ('Cricket Bats', 1),
  ('Cricket Balls', 2),
  ('Pads & Guards', 3),
  ('Gloves', 4),
  ('Helmets', 5),
  ('Cricket Bags', 6),
  ('Kits & Sets', 7),
  ('Accessories', 8)
ON CONFLICT (name) DO NOTHING;

-- 7. Hero images for homepage slider
CREATE TABLE IF NOT EXISTS hero_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  mobile_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE hero_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read active hero" ON hero_images;
CREATE POLICY "Allow public read active hero" ON hero_images
  FOR SELECT USING (is_active = true);

GRANT SELECT ON hero_images TO anon;

-- 8. Charges table (configurable delivery/tax rates)
CREATE TABLE IF NOT EXISTS charges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT NOT NULL UNIQUE,
  label      TEXT NOT NULL,
  value      NUMERIC NOT NULL DEFAULT 0,
  type       TEXT NOT NULL DEFAULT 'fixed' CHECK (type IN ('fixed', 'percentage')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_read_charges" ON charges;
CREATE POLICY "anon_read_charges" ON charges
  FOR SELECT USING (true);

GRANT SELECT ON charges TO anon;

-- Seed default charges
INSERT INTO charges (key, label, value, type) VALUES
  ('delivery_local_fee',         'Local Delivery Fee (Rawalpindi/Islamabad)',      135, 'fixed'),
  ('delivery_outstation_per_kg', 'Outstation Delivery per Kg',                     150, 'fixed'),
  ('delivery_outstation_min',    'Minimum Outstation Delivery Fee',                150, 'fixed'),
  ('tax_percent',                'Tax / GST (%)',                                     0, 'percentage'),
  ('cod_fee',                    'Cash on Delivery Fee',                              0, 'fixed'),
  ('free_shipping_threshold',    'Free Shipping Minimum Order (0 = disabled)',        0, 'fixed')
ON CONFLICT (key) DO NOTHING;

-- 9. Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  items jsonb NOT NULL,
  subtotal NUMERIC NOT NULL,
  discount_amount NUMERIC DEFAULT 0,
  delivery_fee NUMERIC DEFAULT 0,
  tax_amount NUMERIC DEFAULT 0,
  total NUMERIC NOT NULL,
  coupon_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_order_id_idx ON invoices(order_id);
CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON invoices(created_at DESC);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read own invoices"
  ON invoices FOR SELECT
  TO anon, authenticated
  USING (true);

GRANT SELECT ON invoices TO anon;
GRANT SELECT ON invoices TO authenticated;

-- 10. Storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view product images" ON storage.objects;
CREATE POLICY "Public can view product images"
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'product-images');

-- =============================================
-- RPC FUNCTIONS
-- =============================================

-- 11. Generate order number (S7SPORTS-XXXXXX)
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  ord_num TEXT;
  done BOOLEAN := false;
  rnd_str TEXT;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  WHILE NOT done LOOP
    rnd_str := '';
    FOR i IN 1..6 LOOP
      rnd_str := rnd_str || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    ord_num := 'S7SPORTS-' || rnd_str;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM orders WHERE order_number = ord_num);
  END LOOP;
  RETURN ord_num;
END;
$$;

-- 12. Generate invoice number (INV-XXXXXX)
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  inv_num TEXT;
  done BOOLEAN := false;
  rnd_str TEXT;
  chars TEXT := '0123456789';
BEGIN
  WHILE NOT done LOOP
    rnd_str := '';
    FOR i IN 1..6 LOOP
      rnd_str := rnd_str || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    inv_num := 'INV-' || rnd_str;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invoices WHERE invoice_number = inv_num);
  END LOOP;
  RETURN inv_num;
END;
$$;

-- 13. Validate coupon
CREATE OR REPLACE FUNCTION validate_coupon(p_code TEXT)
RETURNS TABLE (id UUID, discount_percent INT, code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec coupons%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM coupons WHERE LOWER(coupons.code) = LOWER(p_code) AND coupons.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid coupon code.';
  END IF;

  IF rec.expires_at IS NOT NULL AND rec.expires_at < now() THEN
    RAISE EXCEPTION 'Coupon has expired.';
  END IF;

  IF rec.max_uses > 0 AND rec.used_count >= rec.max_uses THEN
    RAISE EXCEPTION 'Coupon usage limit reached.';
  END IF;

  RETURN QUERY SELECT rec.id, rec.discount_percent, rec.code;
END;
$$;

GRANT EXECUTE ON FUNCTION validate_coupon(TEXT) TO anon;

-- 14. Cancel order + invoice
CREATE OR REPLACE FUNCTION cancel_order(p_order_id text, p_phone text)
RETURNS TABLE (
  id uuid,
  order_number text,
  created_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_address text,
  items jsonb,
  total numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec orders%ROWTYPE;
  order_uuid uuid;
BEGIN
  SELECT * INTO rec FROM orders
  WHERE (id::text = p_order_id OR order_number = p_order_id)
    AND customer_phone = p_phone
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order cannot be cancelled. Only pending orders can be cancelled.';
  END IF;

  order_uuid := rec.id;

  UPDATE invoices
  SET status = 'cancelled', updated_at = now()
  WHERE order_id = order_uuid AND status = 'active';

  UPDATE orders
  SET status = 'cancelled'
  WHERE id = order_uuid;

  RETURN QUERY SELECT rec.id, rec.order_number, rec.created_at, rec.customer_name, rec.customer_phone,
                      rec.customer_address, rec.items, rec.total, 'cancelled'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_order(text, text) TO anon;
GRANT EXECUTE ON FUNCTION cancel_order(text, text) TO authenticated;

-- 15. Request return
CREATE OR REPLACE FUNCTION request_return(p_order_id text, p_phone text)
RETURNS TABLE (
  id uuid,
  order_number text,
  created_at timestamptz,
  customer_name text,
  customer_phone text,
  customer_address text,
  items jsonb,
  total numeric,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec orders%ROWTYPE;
BEGIN
  UPDATE orders o
  SET status = 'return_requested'
  WHERE (o.id::text = p_order_id OR o.order_number = p_order_id)
    AND o.customer_phone = p_phone
    AND o.status IN ('confirmed', 'shipped', 'delivered')
  RETURNING * INTO rec;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return not available. You can return confirmed, shipped, or delivered orders only.';
  END IF;

  RETURN QUERY SELECT rec.id, rec.order_number, rec.created_at, rec.customer_name, rec.customer_phone,
                      rec.customer_address, rec.items, rec.total, rec.status;
END;
$$;

GRANT EXECUTE ON FUNCTION request_return(text, text) TO anon;
GRANT EXECUTE ON FUNCTION request_return(text, text) TO authenticated;

-- 16. Create invoice
CREATE OR REPLACE FUNCTION create_invoice(p_order_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec       orders%ROWTYPE;
  inv_id          UUID;
  inv_num         TEXT;
  subtotal_calc   NUMERIC;
  discount_calc   NUMERIC;
  coup_rec        coupons%ROWTYPE;
  item            jsonb;
  price_val       TEXT;
  qty_val         INT;
BEGIN
  SELECT * INTO order_rec FROM orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  inv_num := generate_invoice_number();

  subtotal_calc := 0;
  FOR item IN SELECT * FROM jsonb_array_elements(order_rec.items)
  LOOP
    price_val := NULL;
    IF item ? 'price' THEN
      IF jsonb_typeof(item->'price') = 'number' THEN
        price_val := (item->'price')::TEXT;
      ELSIF jsonb_typeof(item->'price') = 'string' THEN
        price_val := item->>'price';
      END IF;
    END IF;

    qty_val := 1;
    IF item ? 'qty' THEN
      IF jsonb_typeof(item->'qty') = 'number' THEN
        qty_val := (item->'qty')::INT;
      ELSIF jsonb_typeof(item->'qty') = 'string' THEN
        qty_val := (item->>'qty')::INT;
      END IF;
    END IF;

    IF price_val IS NOT NULL THEN
      BEGIN
        subtotal_calc := subtotal_calc + (price_val::NUMERIC * qty_val);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Failed to parse price for item: %, price: %', item, price_val;
      END;
    END IF;
  END LOOP;

  discount_calc := 0;
  IF order_rec.coupon_code IS NOT NULL THEN
    SELECT * INTO coup_rec FROM coupons WHERE LOWER(coupons.code) = LOWER(order_rec.coupon_code);
    IF FOUND THEN
      discount_calc := ROUND(subtotal_calc * coup_rec.discount_percent / 100);
    END IF;
  END IF;

  INSERT INTO invoices (
    order_id, invoice_number, customer_name, customer_phone, customer_address,
    items, subtotal, discount_amount, delivery_fee, tax_amount, total, coupon_code, status
  )
  VALUES (
    p_order_id, inv_num, order_rec.customer_name, order_rec.customer_phone, order_rec.customer_address,
    order_rec.items,
    subtotal_calc,
    discount_calc,
    COALESCE(order_rec.delivery_fee, 0),
    COALESCE(order_rec.tax_amount, 0),
    order_rec.total,
    order_rec.coupon_code,
    'active'
  )
  RETURNING id INTO inv_id;

  RETURN inv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_invoice(UUID) TO anon;
GRANT EXECUTE ON FUNCTION create_invoice(UUID) TO authenticated;

-- 17. Place order (atomic: validate stock, decrement, create order + invoice)
CREATE OR REPLACE FUNCTION place_order(
  p_id               uuid,
  p_customer_name    text,
  p_customer_phone   text,
  p_customer_address text,
  p_items            jsonb,
  p_total            numeric,
  p_coupon_code      text DEFAULT NULL,
  p_delivery_fee     numeric DEFAULT 0,
  p_tax_amount       numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item          jsonb;
  prod_id       uuid;
  var_id        uuid;
  prod_qty      int;
  prod_rec      RECORD;
  var_rec       RECORD;
  coup_rec      coupons%ROWTYPE;
  ord_num       text;
  invoice_id    uuid;
BEGIN
  -- Generate unique order_number
  ord_num := generate_order_number();

  INSERT INTO orders (id, customer_name, customer_phone, customer_address, items, total, status, coupon_code, order_number, delivery_fee, tax_amount)
  VALUES (p_id, p_customer_name, p_customer_phone, p_customer_address, p_items, p_total, 'pending',
          CASE WHEN p_coupon_code IS NOT NULL AND p_coupon_code <> '' THEN p_coupon_code ELSE NULL END,
          ord_num,
          p_delivery_fee,
          p_tax_amount);

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    prod_id  := (item->>'id')::uuid;
    prod_qty := (item->>'qty')::int;
    var_id   := (item->>'variant_id')::uuid;

    IF var_id IS NOT NULL THEN
      SELECT * INTO var_rec
      FROM product_variants
      WHERE id = var_id AND product_id = prod_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant not found for product "%"', item->>'title';
      END IF;

      IF var_rec.stock < prod_qty THEN
        RAISE EXCEPTION 'Insufficient stock for "%". Available: %, requested: %',
          item->>'title', var_rec.stock, prod_qty;
      END IF;

      UPDATE product_variants
      SET stock = stock - prod_qty
      WHERE id = var_id;
    ELSE
      SELECT * INTO prod_rec
      FROM products
      WHERE id = prod_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Product not found: %', item->>'title';
      END IF;

      IF prod_rec.stock < prod_qty THEN
        RAISE EXCEPTION 'Insufficient stock for "%". Available: %, requested: %',
          prod_rec.title, prod_rec.stock, prod_qty;
      END IF;

      UPDATE products
      SET stock = stock - prod_qty
      WHERE id = prod_id;
    END IF;
  END LOOP;

  -- Apply coupon if provided
  IF p_coupon_code IS NOT NULL AND p_coupon_code <> '' THEN
    SELECT * INTO coup_rec FROM coupons WHERE LOWER(coupons.code) = LOWER(p_coupon_code) AND coupons.is_active = true FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid coupon code.';
    END IF;

    IF coup_rec.expires_at IS NOT NULL AND coup_rec.expires_at < now() THEN
      RAISE EXCEPTION 'Coupon has expired.';
    END IF;

    IF coup_rec.max_uses > 0 AND coup_rec.used_count >= coup_rec.max_uses THEN
      RAISE EXCEPTION 'Coupon usage limit reached.';
    END IF;

    UPDATE coupons SET used_count = used_count + 1 WHERE id = coup_rec.id;
  END IF;

  -- Automatically create invoice
  invoice_id := create_invoice(p_id);

  RETURN jsonb_build_object('success', true, 'order_id', p_id, 'order_number', ord_num, 'invoice_id', invoice_id);
END;
$$;

GRANT EXECUTE ON FUNCTION place_order(uuid, text, text, text, jsonb, numeric, text, numeric, numeric) TO anon;

-- =============================================
-- PERFORMANCE INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS products_created_at_idx ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS products_featured_idx ON products (featured DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_gin_idx ON products USING GIN (category);
CREATE INDEX IF NOT EXISTS products_id_idx ON products (id);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON orders (order_number);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders (customer_phone);
CREATE INDEX IF NOT EXISTS coupons_code_lower_idx ON coupons (LOWER(code));
CREATE INDEX IF NOT EXISTS coupons_created_at_idx ON coupons (created_at DESC);
CREATE INDEX IF NOT EXISTS hero_images_is_active_idx ON hero_images (is_active) WHERE is_active = true;

-- =============================================
-- SEED PRODUCTS (optional cricket equipment)
-- =============================================

INSERT INTO products (title, description, price, category, stock, image_url, discount_percent, featured, weight_kg) VALUES
  (
    'SS Ton Professional Cricket Bat',
    'Premium English willow cricket bat, Grade A+ quality with sweet spot. Perfect for professional and club level players.',
    8500,
    ARRAY['Cricket Bats'],
    25,
    'https://placehold.co/600x450?text=SS+Ton+Bat',
    0,
    true,
    1.2
  ),
  (
    'CA Sports 1000 Kashmir Willow Bat',
    'High-quality Kashmir willow bat with cane handle, ideal for junior and intermediate players.',
    3500,
    ARRAY['Cricket Bats'],
    40,
    'https://placehold.co/600x450?text=CA+1000+Bat',
    10,
    true,
    1.1
  ),
  (
    'Gray-Nicolls Cobra T20 Bat',
    'Short-handle T20 specialist bat with thick edges. Made from premium English willow.',
    12000,
    ARRAY['Cricket Bats'],
    15,
    'https://placehold.co/600x450?text=GN+Cobra+Bat',
    0,
    false,
    1.15
  ),
  (
    'SG Club Cricket Ball (Leather)',
    'Hand-stitched 4-piece leather cricket ball. Test match quality, 156g standard weight.',
    1200,
    ARRAY['Cricket Balls'],
    100,
    'https://placehold.co/600x450?text=SG+Club+Ball',
    0,
    true,
    0.16
  ),
  (
    'Kookaburra Turf Practice Ball',
    'Two-piece synthetic turf ball, ideal for practice and club matches. Durable seam.',
    800,
    ARRAY['Cricket Balls'],
    150,
    'https://placehold.co/600x450?text=Kookaburra+Turf+Ball',
    5,
    false,
    0.16
  ),
  (
    'Gray-Nicolls Velocity Batting Pads',
    'Full-length batting pads with high-density foam. Adjustable straps, comfortable fit for all day play.',
    4500,
    ARRAY['Pads & Guards'],
    30,
    'https://placehold.co/600x450?text=GN+Velocity+Pads',
    0,
    true,
    1.8
  ),
  (
    'SS Gladiator Batting Gloves',
    'Premium batting gloves with split-finger design, cotton lining, and reinforced thumb.',
    2800,
    ARRAY['Gloves'],
    35,
    'https://placehold.co/600x450?text=SS+Gladiator+Gloves',
    0,
    false,
    0.5
  ),
  (
    'Masuri Elite Series Helmet',
    'Titanium grille helmet with lightweight shell. Adjustable and comfortable. Meets all safety standards.',
    5500,
    ARRAY['Helmets'],
    20,
    'https://placehold.co/600x450?text=Masuri+Elite+Helmet',
    15,
    true,
    0.8
  ),
  (
    'SG Cricket Kit Bag (Large)',
    'Extra-large cricket kit bag with multiple compartments. Holds bat, pads, helmet, and all gear. Water-resistant.',
    3500,
    ARRAY['Cricket Bags'],
    50,
    'https://placehold.co/600x450?text=SG+Kit+Bag',
    0,
    true,
    2.5
  ),
  (
    'SS Complete Cricket Kit (Bat+Pads+Gloves+Helmet)',
    'Complete cricket starter kit. Includes SS Ton bat, batting pads, gloves, and helmet. Everything you need to start playing.',
    18000,
    ARRAY['Kits & Sets'],
    10,
    'https://placehold.co/600x450?text=SS+Complete+Kit',
    5,
    true,
    4.5
  ),
  (
    'Cricket Abdominal Guard (Box)',
    'Lightweight abdominal guard with ergonomic design. Comfortable protection for all ages.',
    500,
    ARRAY['Accessories'],
    200,
    'https://placehold.co/600x450?text=Abdominal+Guard',
    0,
    false,
    0.15
  ),
  (
    'Cricket Thigh Guard',
    'High-density foam thigh guard with elastic straps. Left and right leg options available.',
    800,
    ARRAY['Accessories', 'Pads & Guards'],
    100,
    'https://placehold.co/600x450?text=Thigh+Guard',
    0,
    false,
    0.3
  ),
  (
    'Kookaburra Kahuna Batting Pads',
    'Professional grade batting pads with PVC shell and thick foam. Lightweight yet maximum protection.',
    6500,
    ARRAY['Pads & Guards'],
    15,
    'https://placehold.co/600x450?text=Kookaburra+Kahuna+Pads',
    0,
    false,
    1.9
  ),
  (
    'SG Test Match Batting Gloves',
    'Premium sheep leather batting gloves with reinforced fingers and breathable mesh back.',
    3500,
    ARRAY['Gloves'],
    25,
    'https://placehold.co/600x450?text=SG+Test+Gloves',
    0,
    true,
    0.55
  ),
  (
    'Gray-Nicolls NTO Junior Kit Bag',
    'Compact junior cricket bag. Fits all youth-sized gear. Lightweight with padded shoulder strap.',
    1800,
    ARRAY['Cricket Bags', 'Kits & Sets'],
    40,
    'https://placehold.co/600x450?text=GN+Junior+Bag',
    10,
    false,
    1.0
  )
ON CONFLICT DO NOTHING;


