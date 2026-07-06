export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body;

  const user1 = process.env.VITE_ADMIN_USER1;
  const pass1 = process.env.VITE_ADMIN_PASS1;
  const user2 = process.env.VITE_ADMIN_USER2;
  const pass2 = process.env.VITE_ADMIN_PASS2;

  if (username === user1 && password === pass1) {
    return res.status(200).json({ success: true, user: username });
  }

  if (username === user2 && password === pass2) {
    return res.status(200).json({ success: true, user: username });
  }

  return res.status(401).json({ success: false, error: 'Invalid credentials' });
}
