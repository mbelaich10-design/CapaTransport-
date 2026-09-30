import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const KEYLEN = 64;
const PARAMS = { N: 16384, r: 8, p: 1 };
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const MIN_PASSWORD_LENGTH = 12;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, saltB64, keyB64] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(key, expected);
}

// Hash factice pour égaliser le temps de réponse quand l'email n'existe pas (anti-énumération).
let dummyHash;
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword(crypto.randomBytes(8).toString('hex'));
  await verifyPassword(password, dummyHash);
}

export function createAuthService(db, { sessionHours = 12 } = {}) {
  return {
    async createAdmin(email, password) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error('Email administrateur invalide.');
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      const hash = await hashPassword(password);
      db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email.trim().toLowerCase(), hash);
    },

    countAdmins() {
      return db.prepare('SELECT COUNT(*) AS n FROM admin_users').get().n;
    },

    async login(email, password) {
      const admin = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(String(email).trim());
      if (!admin) { await dummyVerify(String(password)); return null; }
      if (!(await verifyPassword(String(password), admin.password_hash))) return null;

      const token = crypto.randomBytes(32).toString('base64url');
      const csrf = crypto.randomBytes(24).toString('base64url');
      const expiresAt = new Date(Date.now() + sessionHours * 3600 * 1000).toISOString();
      db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(new Date().toISOString());
      db.prepare('INSERT INTO admin_sessions (admin_id, token_hash, csrf_token, expires_at) VALUES (?,?,?,?)').run(admin.id, sha256(token), csrf, expiresAt);
      db.prepare('UPDATE admin_users SET last_login_at = ? WHERE id = ?').run(new Date().toISOString(), admin.id);
      return { token, csrf, expiresAt, admin: { id: admin.id, email: admin.email } };
    },

    getSession(token) {
      if (!token) return null;
      const row = db.prepare(`SELECT s.csrf_token, s.expires_at, a.id, a.email FROM admin_sessions s
        JOIN admin_users a ON a.id = s.admin_id WHERE s.token_hash = ?`).get(sha256(token));
      if (!row || row.expires_at < new Date().toISOString()) return null;
      return { csrf: row.csrf_token, admin: { id: row.id, email: row.email } };
    },

    logout(token) {
      if (token) db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(sha256(token));
    },
  };
}
