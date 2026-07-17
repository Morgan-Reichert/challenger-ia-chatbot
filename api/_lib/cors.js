/**
 * CORS pour les appels depuis l'app native Capacitor (origine capacitor://localhost
 * sur iOS, http(s)://localhost sur Android) et le web.
 * Les endpoints sont protégés par le token Firebase → autoriser toute origine est sûr.
 *
 * Usage en tête de handler :  if (cors(req, res)) return;  // gère le préflight OPTIONS
 */
export function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}
