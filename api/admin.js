export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { path, method, body, prefer, upload } = req.body;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const svcKey = process.env.VITE_SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !svcKey) {
    return res.status(500).json({ error: 'Missing Supabase configuration' });
  }

  const url = `${supabaseUrl}${path}`;
  const headers = {
    'apikey': svcKey,
    'Authorization': `Bearer ${svcKey}`,
  };
  if (prefer) headers['Prefer'] = prefer;

  const fetchOpts = { method: method || 'GET', headers };

  if (upload) {
    headers['Content-Type'] = upload.fileType;
    headers['x-upsert'] = 'true';
    fetchOpts.body = Buffer.from(upload.buffer, 'base64');
  } else if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, fetchOpts);
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text();
    const count = response.headers.get('content-range')?.split('/')[1] || null;
    res.status(response.status).json({ data, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
