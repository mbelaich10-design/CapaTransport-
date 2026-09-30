// Configuration d'environnement (déploiement). Les paramètres MÉTIER sont dans settingsSchema.js.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function loadEnv(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    root,
    production,
    port: Number(env.PORT) || 3000,
    dbPath: env.DATABASE_PATH || path.join(root, 'data', 'capatransport.db'),
    // Derrière un reverse proxy (Render, Fly, Nginx…), mettre TRUST_PROXY=1 pour lire la vraie IP.
    trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : false,
    adminEmail: env.ADMIN_EMAIL || '',
    adminPassword: env.ADMIN_PASSWORD || '',
    sessionHours: Number(env.ADMIN_SESSION_HOURS) || 12,
    // Coupe le rate limiting pour les tests automatisés uniquement.
    rateLimit: env.RATE_LIMIT_DISABLED !== '1',
  };
}
