import express from 'express';
import { LEAD_STATUSES, ACTIVITIES, TRANSPORT_TYPES, labelOf } from '../../shared/rules.js';
import { SETTINGS_BY_KEY, SETTINGS_GROUPS, SETTINGS_SCHEMA, validateSettingValue } from '../config/settingsSchema.js';
import { rateLimit } from '../middleware/security.js';
import { leadsToCsv } from '../services/csv.js';

const COOKIE = 'ct_admin';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie mal encodé : ignoré */ }
    }
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = (v, list) => (list.includes(v) ? v : undefined);

export function parseLeadFilters(q = {}) {
  const str = (v, max = 100) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize, 10) || 25));
  return {
    q: str(q.q),
    status: oneOf(q.status, LEAD_STATUSES.map((s) => s.value)),
    activity: oneOf(q.activity, ACTIVITIES.map((s) => s.value)),
    transportType: oneOf(q.transportType, TRANSPORT_TYPES.map((s) => s.value)),
    source: str(q.source, 60),
    consent: oneOf(q.consent, ['0', '1']),
    from: typeof q.from === 'string' && DATE_RE.test(q.from) ? q.from : undefined,
    to: typeof q.to === 'string' && DATE_RE.test(q.to) ? q.to : undefined,
    sort: str(q.sort, 20),
    dir: q.dir === 'asc' ? 'asc' : 'desc',
    page, pageSize,
  };
}

const leadDto = (r) => ({
  id: r.id, firstName: r.first_name, lastName: r.last_name, email: r.email, phone: r.phone,
  marketingConsent: r.marketing_consent === 1, status: r.status, source: r.source, utmMedium: r.utm_medium,
  utmCampaign: r.utm_campaign, createdAt: r.created_at, simulationId: r.simulation_public_id,
  activity: r.activity, transportType: r.transport_type, legalStatus: r.legal_status,
  revenueMonthly: r.revenue_monthly, chargesMonthly: r.charges_monthly, resultMonthly: r.result_monthly,
  simulationsCount: r.simulations_count,
});

export function adminRoutes({ auth, leads, simulations, settings, env }) {
  const router = express.Router();
  const loginLimit = rateLimit({
    windowMs: 15 * 60_000, max: 8, enabled: env.rateLimit,
    key: (req) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase().slice(0, 100)}`,
    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
  });
  const cookieOpts = (maxAgeMs) => ({ httpOnly: true, sameSite: 'strict', secure: env.production, path: '/', maxAge: maxAgeMs });

  router.post('/login', loginLimit, async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password || password.length > 500) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }
    const session = await auth.login(email, password);
    if (!session) return res.status(401).json({ error: 'Identifiants incorrects.' });
    res.cookie(COOKIE, session.token, cookieOpts(env.sessionHours * 3600_000));
    res.json({ admin: session.admin, csrf: session.csrf });
  });

  // ---- Tout ce qui suit exige une session admin valide ----
  router.use((req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const session = auth.getSession(token);
    if (!session) return res.status(401).json({ error: 'Authentification requise.' });
    req.adminToken = token; req.admin = session.admin; req.csrf = session.csrf;
    if (!['GET', 'HEAD'].includes(req.method) && req.get('x-csrf-token') !== session.csrf) {
      return res.status(403).json({ error: 'Jeton CSRF invalide.' });
    }
    next();
  });

  router.get('/me', (req, res) => res.json({ admin: req.admin, csrf: req.csrf }));

  router.post('/logout', (req, res) => {
    auth.logout(req.adminToken);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  router.get('/dashboard', (req, res) => {
    const stats = simulations.stats();
    const recent = leads.list({ page: 1, pageSize: 8, sort: 'date', dir: 'desc' }).rows.map(leadDto);
    res.json({ stats, recentLeads: recent });
  });

  router.get('/leads', (req, res) => {
    const f = parseLeadFilters(req.query);
    const { rows, total } = leads.list(f);
    res.json({
      leads: rows.map(leadDto), total, page: f.page, pageSize: f.pageSize,
      pages: Math.max(1, Math.ceil(total / f.pageSize)), sources: leads.distinctSources(),
    });
  });

  router.get('/leads/export.csv', (req, res) => {
    const rows = leads.listAll(parseLeadFilters(req.query)).map(leadDto);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="prospects-capatransport-${stamp}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(leadsToCsv(rows));
  });

  router.get('/leads/:id', (req, res) => {
    const row = leads.get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Prospect introuvable.' });
    const sim = simulations.latestForLead(row.id);
    res.json({ lead: leadDto(row), simulation: sim && { id: sim.publicId, createdAt: sim.createdAt, input: sim.input, results: sim.results, reportStatus: sim.reportStatus } });
  });

  router.patch('/leads/:id', (req, res) => {
    const status = req.body?.status;
    if (!LEAD_STATUSES.some((s) => s.value === status)) return res.status(422).json({ error: 'Statut invalide.' });
    if (!leads.setStatus(Number(req.params.id), status)) return res.status(404).json({ error: 'Prospect introuvable.' });
    res.json({ ok: true, status, label: labelOf(LEAD_STATUSES, status) });
  });

  router.get('/settings', (req, res) => {
    res.json({ groups: SETTINGS_GROUPS, schema: SETTINGS_SCHEMA, values: settings.getAll() });
  });

  router.put('/settings', (req, res) => {
    const incoming = req.body?.values;
    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return res.status(400).json({ error: 'Format invalide.' });
    const clean = {}; const fields = {};
    for (const [key, raw] of Object.entries(incoming)) {
      const def = SETTINGS_BY_KEY[key];
      if (!def) { fields[key] = 'Paramètre inconnu.'; continue; }
      const r = validateSettingValue(def, raw);
      if (r.error) fields[key] = r.error; else clean[key] = r.value;
    }
    if (Object.keys(fields).length) return res.status(422).json({ error: 'Certaines valeurs sont invalides.', fields });
    settings.setMany(clean);
    res.json({ values: settings.getAll() });
  });

  return router;
}
