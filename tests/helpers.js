import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/config/env.js';
import { openDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';

export const ADMIN = { email: 'admin@test.fr', password: 'un-mot-de-passe-solide-42' };

export const validInput = () => ({
  project: { transportType: 'light', activity: 'delivery', legalStatus: 'micro' },
  vehicle: { owned: false, mode: 'credit', monthlyCost: 450, consumption: 8.5, fuelPrice: 1.85 },
  work: { daysPerMonth: 20, tripsPerDay: 6, avgPrice: 25, avgDistance: 20 },
  charges: { insurance: 120, maintenance: null, tolls: 60, phone: 30, software: 25, accounting: 90, other: 100 },
  target: { income: 2000 },
});

export const validLead = (over = {}) => ({ firstName: 'Camille', lastName: 'Durand', email: 'camille@example.com', phone: '06 12 34 56 78', marketingConsent: false, ...over });

/** Démarre l'application complète sur un port éphémère avec une base en mémoire. */
export async function startTestServer({ rateLimit = false } = {}) {
  const env = { ...loadEnv({ NODE_ENV: 'test' }), rateLimit };
  env.root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const db = openDatabase(':memory:');
  const { app, services } = createApp({ db, env });
  await services.auth.createAdmin(ADMIN.email, ADMIN.password);
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;

  const client = (initialCookie = '') => {
    let cookie = initialCookie; let csrf = '';
    const call = async (method, url, body, headers = {}) => {
      const res = await fetch(base + url, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const raw = Buffer.from(await res.arrayBuffer());
      const text = raw.toString('utf8');
      let json = null; try { json = JSON.parse(text); } catch { /* pas du JSON */ }
      return { status: res.status, json, text, raw, headers: res.headers };
    };
    return {
      call,
      async login(creds = ADMIN) {
        const r = await call('POST', '/api/admin/login', creds);
        if (r.json?.csrf) csrf = r.json.csrf;
        return r;
      },
      setCsrf: (v) => { csrf = v; },
    };
  };
  return { base, db, services, client, close: () => new Promise((r) => server.close(() => { db.close(); r(); })) };
}
