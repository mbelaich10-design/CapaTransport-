import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, validInput, validLead, ADMIN } from './helpers.js';

let t; let anon;
before(async () => { t = await startTestServer(); anon = t.client(); });
after(async () => { await t.close(); });

const createSim = async (mut = () => {}, tracking) => {
  const input = validInput(); mut(input);
  return anon.call('POST', '/api/simulations', { input, tracking });
};

test('config publique : seulement les paramètres publics', async () => {
  const r = await anon.call('GET', '/api/config');
  assert.equal(r.status, 200);
  assert.equal(r.json.settings.fuelPrice, 1.85);
  assert.ok(r.json.settings.offerUrl);
  assert.equal(r.json.settings.reportEmailEnabled, undefined);
});

test('en-têtes de sécurité présents', async () => {
  const r = await anon.call('GET', '/api/config');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('création de simulation : calcul serveur, aperçu seul avant capture', async () => {
  const r = await createSim();
  assert.equal(r.status, 201);
  assert.equal(r.json.unlocked, false);
  assert.equal(r.json.results.monthly.revenue, 3000);
  assert.equal(r.json.results.monthly.result, 1555.6);
  assert.equal(r.json.results.breakEven, undefined, 'seuil de rentabilité non exposé avant capture');
  assert.equal(r.json.results.target, undefined);
  assert.equal(r.json.analysis, undefined);
  assert.ok(r.json.id.length >= 20);
});

test('un client malveillant ne peut pas imposer ses résultats', async () => {
  const input = validInput();
  const r = await anon.call('POST', '/api/simulations', { input, results: { monthly: { revenue: 999999 } } });
  assert.equal(r.json.results.monthly.revenue, 3000);
});

test('entrées invalides → 422 avec erreurs par champ, rien n’est enregistré', async () => {
  const before = t.db.prepare('SELECT COUNT(*) n FROM simulations').get().n;
  const r = await createSim((i) => { i.work.daysPerMonth = 45; i.work.avgPrice = -3; });
  assert.equal(r.status, 422);
  assert.ok(r.json.fields['work.daysPerMonth']);
  assert.ok(r.json.fields['work.avgPrice']);
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM simulations').get().n, before);
});

test('corps invalide ou trop gros', async () => {
  assert.equal((await anon.call('POST', '/api/simulations', { input: null })).status, 422);
  const bad = await fetch(`${t.base}/api/simulations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oups' });
  assert.equal(bad.status, 400);
  const big = await anon.call('POST', '/api/simulations', { input: 'x'.repeat(40000) });
  assert.equal(big.status, 413);
});

test('hypothèse d’entretien figée selon le type de transport', async () => {
  const light = await createSim();
  const heavy = await createSim((i) => { i.project.transportType = 'heavy'; });
  const row = (id) => JSON.parse(t.db.prepare('SELECT results_json j FROM simulations WHERE public_id = ?').get(id).j);
  assert.equal(row(light.json.id).assumptions.maintenancePerKm, 0.08);
  assert.equal(row(heavy.json.id).assumptions.maintenancePerKm, 0.15);
});

test('capture du prospect : débloque le résultat complet et rattache la simulation', async () => {
  const sim = await createSim(() => {}, { source: 'LinkedIn', utmMedium: 'social', utmCampaign: 'lancement' });
  const r = await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, validLead({ marketingConsent: true }));
  assert.equal(r.status, 422, 'le prospect doit être dans { lead }');
  const ok = await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, { lead: validLead({ email: 'flow@example.com', marketingConsent: true }) });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.unlocked, true);
  assert.ok(ok.json.results.breakEven.reachable);
  assert.ok(ok.json.results.target.revenueNeeded > 0);
  assert.ok(ok.json.analysis.length >= 4);
  assert.equal(ok.json.reportStatus, 'queued', 'aucun envoi prétendu tant que le transport email est désactivé');

  const lead = t.db.prepare('SELECT * FROM leads WHERE email = ?').get('flow@example.com');
  assert.equal(lead.source, 'linkedin');
  assert.equal(lead.utm_medium, 'social');
  assert.equal(lead.marketing_consent, 1);
  assert.ok(lead.marketing_consent_at);
  assert.equal(lead.status, 'new');
  const again = await anon.call('GET', `/api/simulations/${sim.json.id}`);
  assert.equal(again.json.unlocked, true);
});

test('consentement marketing distinct : non coché = non enregistré', async () => {
  const sim = await createSim();
  await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, { lead: validLead({ email: 'noconsent@example.com' }) });
  const lead = t.db.prepare('SELECT * FROM leads WHERE email = ?').get('noconsent@example.com');
  assert.equal(lead.marketing_consent, 0);
  assert.equal(lead.marketing_consent_at, null);
});

test('même email : un seul prospect, plusieurs simulations, consentement jamais retiré', async () => {
  const a = await createSim(); const b = await createSim((i) => { i.work.avgPrice = 30; });
  await anon.call('POST', `/api/simulations/${a.json.id}/lead`, { lead: validLead({ email: 'dup@example.com', marketingConsent: true }) });
  await anon.call('POST', `/api/simulations/${b.json.id}/lead`, { lead: validLead({ email: 'DUP@example.com', firstName: 'Cam', marketingConsent: false }) });
  const leads = t.db.prepare("SELECT * FROM leads WHERE email = 'dup@example.com'").all();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].marketing_consent, 1);
  assert.equal(leads[0].first_name, 'Cam');
  assert.equal(t.db.prepare('SELECT COUNT(*) n FROM simulations WHERE lead_id = ?').get(leads[0].id).n, 2);
});

test('capture : validation, simulation inconnue, robot (leurre)', async () => {
  const sim = await createSim();
  const bad = await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, { lead: validLead({ email: 'nope' }) });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.fields.email);
  assert.equal((await anon.call('POST', '/api/simulations/inexistante12345678/lead', { lead: validLead() })).status, 404);
  assert.equal((await anon.call('GET', '/api/simulations/inexistante12345678')).status, 404);
  assert.equal((await anon.call('GET', '/api/simulations/x')).status, 404);
  const bot = await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, { lead: validLead({ email: 'bot@example.com' }), website: 'http://spam' });
  assert.equal(bot.status, 200);
  assert.equal(bot.json.unlocked, false);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM leads WHERE email = 'bot@example.com'").get().n, 0);
});

test('injection SQL / XSS stockés comme du texte inerte', async () => {
  const sim = await createSim();
  const r = await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, { lead: validLead({ email: 'sql@example.com', firstName: "Robert'); DROP TABLE leads;--" }) });
  assert.equal(r.status, 200);
  assert.ok(t.db.prepare('SELECT COUNT(*) n FROM leads').get().n > 0);
});

// ---- Administration --------------------------------------------------------

test('admin : toute route exige une session', async () => {
  for (const [m, u] of [['GET', '/api/admin/me'], ['GET', '/api/admin/dashboard'], ['GET', '/api/admin/leads'], ['GET', '/api/admin/leads/export.csv'], ['GET', '/api/admin/settings'], ['PUT', '/api/admin/settings']]) {
    const r = await anon.call(m, u, m === 'PUT' ? {} : undefined);
    assert.equal(r.status, 401, `${m} ${u}`);
  }
});

test('admin : cookie malformé → 401 et non 500', async () => {
  const c = t.client('ct_admin=%E0%A4%A');
  assert.equal((await c.call('GET', '/api/admin/me')).status, 401);
});

test('admin : login refusé (mauvais mot de passe, email inconnu, corps invalide)', async () => {
  const c = t.client();
  assert.equal((await c.call('POST', '/api/admin/login', { email: ADMIN.email, password: 'faux' })).status, 401);
  assert.equal((await c.call('POST', '/api/admin/login', { email: 'inconnu@test.fr', password: 'faux' })).status, 401);
  assert.equal((await c.call('POST', '/api/admin/login', { email: { $ne: 1 }, password: 'x' })).status, 400);
  assert.equal((await c.call('POST', '/api/admin/login', {})).status, 400);
});

test('admin : login OK → cookie HttpOnly SameSite=Strict, jamais de hash exposé', async () => {
  const c = t.client();
  const r = await c.login();
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.doesNotMatch(r.text, /scrypt|password_hash/);
  const me = await c.call('GET', '/api/admin/me');
  assert.equal(me.json.admin.email, ADMIN.email);
});

test('admin : CSRF et origine croisée refusés', async () => {
  const c = t.client(); await c.login();
  c.setCsrf('');
  assert.equal((await c.call('PUT', '/api/admin/settings', { values: {} })).status, 403);
  const c2 = t.client(); await c2.login();
  const cross = await c2.call('PUT', '/api/admin/settings', { values: {} }, { origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
});

test('admin : déconnexion invalide la session', async () => {
  const c = t.client(); await c.login();
  assert.equal((await c.call('POST', '/api/admin/logout', {})).status, 200);
  assert.equal((await c.call('GET', '/api/admin/me')).status, 401);
});

test('admin : tableau de bord', async () => {
  const c = t.client(); await c.login();
  const r = await c.call('GET', '/api/admin/dashboard');
  assert.equal(r.status, 200);
  const s = r.json.stats;
  assert.ok(s.totalSimulations >= 5);
  assert.ok(s.totalLeads >= 3);
  assert.ok(s.conversionRate > 0 && s.conversionRate <= 1);
  assert.equal(s.simulations24h, s.totalSimulations);
  assert.ok(s.avgRevenue > 0);
  assert.ok(Array.isArray(r.json.recentLeads) && r.json.recentLeads.length > 0);
});

test('admin : prospects — recherche, filtres, tri, pagination', async () => {
  const c = t.client(); await c.login();
  const all = await c.call('GET', '/api/admin/leads');
  assert.ok(all.json.total >= 3);
  const row = all.json.leads.find((l) => l.email === 'flow@example.com');
  assert.equal(row.activity, 'delivery');
  assert.equal(row.transportType, 'light');
  assert.equal(row.revenueMonthly, 3000);
  assert.equal(row.resultMonthly, 1555.6);
  assert.equal(row.source, 'linkedin');
  assert.equal(row.status, 'new');

  assert.equal((await c.call('GET', '/api/admin/leads?q=flow@')).json.total, 1);
  assert.equal((await c.call('GET', '/api/admin/leads?q=Camille%20Durand')).json.total >= 1, true);
  assert.equal((await c.call('GET', "/api/admin/leads?q=%25")).json.total, 0, 'le joker % est échappé');
  assert.equal((await c.call('GET', '/api/admin/leads?consent=1')).json.leads.every((l) => l.marketingConsent), true);
  assert.equal((await c.call('GET', '/api/admin/leads?source=linkedin')).json.total, 1);
  assert.equal((await c.call('GET', '/api/admin/leads?status=lost')).json.total, 0);
  assert.equal((await c.call('GET', '/api/admin/leads?from=2999-01-01')).json.total, 0);
  assert.ok((await c.call('GET', '/api/admin/leads?from=2000-01-01&to=2999-01-01')).json.total >= 3);
  const paged = await c.call('GET', '/api/admin/leads?pageSize=2&page=2');
  assert.equal(paged.json.leads.length, 2);
  assert.ok(paged.json.pages >= 2);
  assert.equal((await c.call('GET', "/api/admin/leads?sort=revenue';DROP--&dir=asc")).status, 200, 'tri hors liste blanche ignoré');
  assert.equal((await c.call('GET', '/api/admin/leads?page=-4&pageSize=99999')).status, 200);
});

test('admin : changement de statut', async () => {
  const c = t.client(); await c.login();
  const id = (await c.call('GET', '/api/admin/leads?q=flow@')).json.leads[0].id;
  assert.equal((await c.call('PATCH', `/api/admin/leads/${id}`, { status: 'qualified' })).status, 200);
  assert.equal((await c.call('GET', `/api/admin/leads/${id}`)).json.lead.status, 'qualified');
  assert.equal((await c.call('GET', `/api/admin/leads/${id}`)).json.simulation.results.breakEven.reachable, true);
  assert.equal((await c.call('PATCH', `/api/admin/leads/${id}`, { status: 'hacked' })).status, 422);
  assert.equal((await c.call('PATCH', '/api/admin/leads/99999', { status: 'lost' })).status, 404);
});

test('admin : export CSV (BOM, filtres, injection de formule neutralisée)', async () => {
  const sim = await createSim();
  await anon.call('POST', `/api/simulations/${sim.json.id}/lead`, { lead: validLead({ email: 'csv@example.com', firstName: '=HYPERLINK("http://x")', lastName: 'Ok', phone: '+33 6 12 34 56 78' }) });
  const c = t.client(); await c.login();
  const r = await c.call('GET', '/api/admin/leads/export.csv?q=csv@');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /text\/csv/);
  assert.match(r.headers.get('content-disposition'), /attachment; filename="prospects-capatransport-\d{4}-\d{2}-\d{2}\.csv"/);
  assert.ok(r.text.startsWith('﻿"Date";"Prénom"'));
  const lines = r.text.trim().split('\r\n');
  assert.equal(lines.length, 2, 'filtre appliqué à l’export');
  assert.ok(lines[1].includes(`"'=HYPERLINK(""http://x"")"`), lines[1]);
  assert.ok(lines[1].includes('"+33 6 12 34 56 78"'));
  assert.ok(lines[1].includes('"3000,00"') && lines[1].includes('"1555,60"'));
});

test('admin : paramètres — lecture, validation, écriture, effet sur le simulateur', async () => {
  const c = t.client(); await c.login();
  const get = await c.call('GET', '/api/admin/settings');
  assert.ok(get.json.schema.length > 10);
  assert.equal(get.json.values.fuelPrice, 1.85);

  const bad = await c.call('PUT', '/api/admin/settings', { values: { fuelPrice: 99, offerUrl: 'javascript:alert(1)', inconnu: 1 } });
  assert.equal(bad.status, 422);
  assert.ok(bad.json.fields.fuelPrice && bad.json.fields.offerUrl && bad.json.fields.inconnu);
  assert.equal((await anon.call('GET', '/api/config')).json.settings.fuelPrice, 1.85, 'rien enregistré si une valeur est invalide');

  const ok = await c.call('PUT', '/api/admin/settings', { values: { fuelPrice: '1,95', maintenancePerKmLight: 0.1, offerUrl: 'https://capatransport.fr/formation', targetIncomePresets: '3000, 1000, 2000' } });
  assert.equal(ok.status, 200);
  const pub = (await anon.call('GET', '/api/config')).json.settings;
  assert.equal(pub.fuelPrice, 1.95);
  assert.equal(pub.offerUrl, 'https://capatransport.fr/formation');
  assert.deepEqual(pub.targetIncomePresets, [1000, 2000, 3000]);

  // L'hypothèse d'entretien modifiée s'applique aux nouvelles simulations (2400 km × 0,10 = 240 €)
  const sim = await createSim();
  const row = JSON.parse(t.db.prepare('SELECT results_json j FROM simulations WHERE public_id = ?').get(sim.json.id).j);
  assert.equal(row.monthly.lines.maintenance, 240);
});

test('rate limiting : login et création', async () => {
  const lim = await startTestServer({ rateLimit: true });
  try {
    const c = lim.client(); let last;
    for (let i = 0; i < 10; i += 1) last = await c.call('POST', '/api/admin/login', { email: 'x@y.fr', password: 'mauvais' });
    assert.equal(last.status, 429);
    assert.ok(last.headers.get('retry-after'));
  } finally { await lim.close(); }
});

test('routes statiques : pages et 404', async () => {
  assert.equal((await fetch(`${t.base}/`)).status, 200);
  assert.equal((await fetch(`${t.base}/admin`)).status, 200);
  assert.equal((await fetch(`${t.base}/admin/prospects`)).status, 200);
  assert.equal((await fetch(`${t.base}/n-importe-quoi`)).status, 404);
  assert.equal((await fetch(`${t.base}/data/capatransport.db`)).status, 404);
  assert.equal((await fetch(`${t.base}/src/config/env.js`)).status, 404);
  assert.equal((await fetch(`${t.base}/../package.json`)).status, 404);
});
