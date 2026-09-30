// En-têtes de sécurité, rate limiting mémoire, contrôle d'origine, gestion d'erreurs.

export function securityHeaders({ production }) {
  const csp = [
    "default-src 'self'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
    "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'",
    "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    next();
  };
}

/** Limiteur fixe par fenêtre, en mémoire (suffisant pour une instance ; Redis si multi-instance). */
export function rateLimit({ windowMs, max, key = (req) => req.ip, enabled = true, message = 'Trop de requêtes, réessayez dans quelques instants.' }) {
  const hits = new Map();
  const sweep = setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs);
  sweep.unref();
  const middleware = (req, res, next) => {
    if (!enabled) return next();
    const k = key(req); const now = Date.now();
    let e = hits.get(k);
    if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; hits.set(k, e); }
    e.count += 1;
    if (e.count > max) {
      res.setHeader('Retry-After', Math.ceil((e.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
  middleware.reset = () => hits.clear();
  return middleware;
}

/** Refuse les requêtes modifiantes dont l'Origin ne correspond pas à l'hôte (défense CSRF en profondeur). */
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { host = null; }
    if (host !== req.get('host')) return res.status(403).json({ error: 'Origine non autorisée.' });
  }
  next();
}

export function notFoundApi(req, res) {
  res.status(404).json({ error: 'Ressource introuvable.' });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.status === 422 && err.errors) return res.status(422).json({ error: err.message, fields: err.errors });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse.' });
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) return res.status(400).json({ error: 'JSON invalide.' });
  console.error('[erreur]', req.method, req.path, err); // détail en log serveur uniquement
  res.status(500).json({ error: 'Une erreur est survenue. Merci de réessayer.' });
}
