const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SVC_KEY = process.env.VITE_SUPABASE_SERVICE_KEY;

const LOCAL_CITIES = new Set(['rawalpindi', 'islamabad']);

async function getCharge(key) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/charges?key=eq.${encodeURIComponent(key)}&limit=1`,
      { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } }
    );
    const data = await r.json();
    return parseFloat(data?.[0]?.value ?? 0);
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { city, cart } = req.body;
  if (!city) return res.status(400).json({ fee: 0 });

  const [localFee, perKg, minFee] = await Promise.all([
    getCharge('delivery_local_fee'),
    getCharge('delivery_outstation_per_kg'),
    getCharge('delivery_outstation_min'),
  ]);

  if (LOCAL_CITIES.has(city)) {
    return res.status(200).json({ fee: Math.max(localFee, 0), local: true });
  }

  let totalWeightKg = 0;
  if (cart && cart.length) {
    for (const item of cart) {
      try {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/products?id=eq.${item.id}&select=weight_kg`,
          { headers: { apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` } }
        );
        const data = await r.json();
        const kg = parseFloat(data?.[0]?.weight_kg ?? 0);
        totalWeightKg += kg * (item.qty || 1);
      } catch { }
    }
    totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;
  }

  const fee = totalWeightKg > 0
    ? Math.ceil(totalWeightKg * Math.max(perKg, 0))
    : Math.max(minFee, 0);

  res.status(200).json({ fee, local: false });
}
