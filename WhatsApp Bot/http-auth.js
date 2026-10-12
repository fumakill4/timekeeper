// Created by i729
function createRequireAdmin(verifyToken) {
  return async (req, res, next) => {
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return res.status(401).json({ error: 'Firebase authentication required' });
    try {
      const user = await verifyToken(token, true);
      if (user.timekeeperAdmin !== true) return res.status(403).json({ error: 'Administrator access required' });
      req.firebaseUser = user;
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired Firebase session' });
    }
  };
}
module.exports = { createRequireAdmin };
