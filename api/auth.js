export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password required' });
  }

  const users = {
    [process.env.VITE_ADMIN_USER1 || 'Salman']: process.env.VITE_ADMIN_PASS1 || '',
    [process.env.VITE_ADMIN_USER2 || 'Ahmed']: process.env.VITE_ADMIN_PASS2 || '',
  };

  if (users[username] && users[username] === password) {
    return res.status(200).json({ success: true, user: username });
  }

  return res.status(401).json({ success: false, error: 'Invalid credentials' });
}
