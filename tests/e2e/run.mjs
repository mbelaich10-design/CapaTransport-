// Test de bout en bout (navigateur réel) : parcours complet mobile + desktop + administration.
// Lancer : npm run test:e2e   (nécessite Chromium ; captures dans tests/e2e/out/)
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startTestServer, ADMIN } from '../helpers.js';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
const t = await startTestServer();
// CHROMIUM_PATH permet d'utiliser un Chromium déjà installé (sinon : navigateur géré par Playwright).
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });

async function newPage(viewport, isMobile = false) {
  const ctx = await browser.newContext({ viewport, isMobile, hasTouch: isMobile, deviceScaleFactor: isMobile ? 2 : 1, locale: 'fr-FR' });
  const page = await ctx.newPage();
  // Les statuts HTTP 401/404/422 sont provoqués volontairement par ce test (et vérifiés par des assertions) :
  // on ne garde que les vraies erreurs JS, les violations CSP et les avertissements.
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource/.test(m.text())) problems.push(`[console.${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => { if (!/ERR_ABORTED/.test(r.failure()?.errorText ?? '')) problems.push(`[requestfailed] ${r.url()}`); });
  return page;
}
const noHScroll = async (page, label) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${label} : débordement horizontal de ${over}px`);
};
const fill = (page, label, value) => page.getByLabel(label, { exact: true }).fill(String(value));

try {
  // ============ PARCOURS PUBLIC — MOBILE ============
  const page = await newPage({ width: 390, height: 844 }, true);
  await page.goto(`${t.base}/?utm_source=linkedin&utm_medium=social`);
  await page.waitForSelector('h1');
  await noHScroll(page, 'accueil'); await shot(page, '01-accueil-mobile');
  assert.match(await page.locator('h1').innerText(), /rentable/);

  await page.getByRole('link', { name: /Simuler mon projet gratuitement/ }).first().click();
  await page.waitForURL('**/simulation/1');

  // Étape 1 : validation (rien de choisi)
  await page.getByRole('button', { name: /Continuer/ }).click();
  assert.ok(await page.locator('.field-error:visible').count() >= 3, 'erreurs étape 1');
  await shot(page, '02-etape1-erreurs');
  await page.getByText('Transport léger ≤ 3,5 t').click();
  await page.getByText('Livraison', { exact: true }).click();
  await page.getByText('Micro-entreprise').click();
  await noHScroll(page, 'étape 1'); await shot(page, '03-etape1');
  await page.getByRole('button', { name: /Continuer/ }).click();

  // Étape 2 : véhicule (valeurs par défaut pré-remplies)
  await page.waitForURL('**/simulation/2');
  assert.equal(await page.getByLabel('Prix du carburant').inputValue(), '1,85');
  assert.equal(await page.getByLabel('Consommation moyenne').inputValue(), '8,5');
  await page.getByText('Non', { exact: true }).click();
  await page.getByText('Crédit', { exact: true }).click();
  assert.match(await page.locator('label[for]').filter({ hasText: /Mensualité/ }).innerText(), /Mensualité du crédit/);
  await page.getByLabel('Mensualité du crédit').fill('0');
  await page.getByRole('button', { name: /Continuer/ }).click();
  assert.match(await page.locator('.field-error:visible').first().innerText(), /mensualité|supérieur à 0/i);
  await page.getByLabel('Mensualité du crédit').fill('450');
  await noHScroll(page, 'étape 2'); await shot(page, '04-etape2');
  await page.getByRole('button', { name: /Continuer/ }).click();

  // Étape 3 : activité + aperçu en direct
  await page.waitForURL('**/simulation/3');
  await fill(page, 'Nombre de courses par jour', 6);
  await fill(page, 'Prix moyen d’une course', '25');
  await fill(page, 'Distance moyenne d’une course', 20);
  const live = await page.locator('.live').innerText();
  assert.match(live, /3\s?000\s?€/); assert.match(live, /36\s?000\s?€/); assert.match(live, /2\s?400\s?km/); assert.match(live, /377\s?€/);
  await fill(page, 'Nombre de courses par jour', 60); await fill(page, 'Distance moyenne d’une course', 100);
  await page.getByRole('button', { name: /Continuer/ }).click();
  assert.match(await page.locator('.field-error:visible').first().innerText(), /Incohérent/);
  await shot(page, '05-etape3-incoherent');
  await fill(page, 'Nombre de courses par jour', 6); await fill(page, 'Distance moyenne d’une course', 20);
  await noHScroll(page, 'étape 3'); await shot(page, '06-etape3');
  await page.getByRole('button', { name: /Continuer/ }).click();

  // Étape 4 : charges
  await page.waitForURL('**/simulation/4');
  assert.equal(await page.getByLabel('Assurance').inputValue(), '120');
  assert.match(await page.locator('.auto-note').innerText(), /Estimation automatique : 192 €/);
  assert.match(await page.locator('.live').innerText(), /1\s?444\s?€/);
  await fill(page, 'Assurance', '-5');
  await page.getByRole('button', { name: /Continuer/ }).click();
  assert.ok(await page.locator('.field-error:visible').count() === 1);
  await fill(page, 'Assurance', 120);
  await noHScroll(page, 'étape 4'); await shot(page, '07-etape4');
  await page.getByRole('button', { name: /Continuer/ }).click();

  // Étape 5 : objectif
  await page.waitForURL('**/simulation/5');
  await page.getByRole('button', { name: /Voir mes résultats/ }).click();
  assert.ok(await page.locator('.field-error:visible').count() === 1);
  await page.getByRole('button', { name: '2 000 €' }).click();
  await shot(page, '08-etape5');
  await page.getByRole('button', { name: /Voir mes résultats/ }).click();

  // Résultats verrouillés
  await page.waitForURL('**/resultats/*');
  await page.waitForSelector('#rapport');
  const teaser = await page.locator('.results').innerText();
  assert.match(teaser, /Simulation indicative\. Les résultats sont calculés/);
  assert.match(teaser, /3\s?000\s?€/); assert.match(teaser, /1\s?556\s?€/);
  assert.doesNotMatch(teaser, /1\s?031\s?€/, 'seuil non exposé avant capture');
  assert.doesNotMatch(teaser, /3\s?562\s?€/, 'CA objectif non exposé avant capture');
  await noHScroll(page, 'résultats verrouillés'); await shot(page, '09-resultats-verrouilles');

  // Formulaire prospect : erreurs puis succès
  await page.getByRole('button', { name: /Recevoir mon rapport/ }).click();
  assert.ok(await page.locator('#rapport .field-error:visible').count() >= 3);
  await shot(page, '10-formulaire-erreurs');
  await page.getByLabel('Prénom', { exact: true }).fill('Camille');
  await page.getByLabel('Nom', { exact: true }).fill('Durand');
  await page.getByLabel('Email', { exact: true }).fill('pas-un-email');
  await page.getByRole('button', { name: /Recevoir mon rapport/ }).click();
  assert.match(await page.locator('#rapport .field-error:visible').first().innerText(), /Email/);
  await page.getByLabel('Email', { exact: true }).fill('camille@example.com');
  await page.getByLabel(/Téléphone/).fill('06 12 34 56 78');
  assert.equal(await page.locator('#marketing-consent').isChecked(), false, 'consentement décoché par défaut');
  await page.getByRole('button', { name: /Recevoir mon rapport/ }).click();

  await page.waitForSelector('.banner.ok');
  const full = await page.locator('.results').innerText();
  for (const re of [/1\s?031\s?€/, /3\s?562\s?€/, /51,9\s?%/, /Ce que disent vos chiffres/, /Où partent vos charges/, /Où vous situez-vous/, /Vous souhaitez être accompagné dans votre projet/]) assert.match(full, re, String(re));
  assert.ok(await page.getByRole('link', { name: /Découvrir l’accompagnement/ }).getAttribute('href').then((h) => h.includes('utm_source=simulateur')));
  await noHScroll(page, 'résultats complets'); await shot(page, '11-resultats-complets-mobile');

  const resultsUrl = page.url();
  // Rechargement : le résultat complet persiste (état côté serveur)
  await page.reload(); await page.waitForSelector('.analysis');

  // Modifier mes hypothèses : brouillon rechargé avec les valeurs de la simulation
  await page.getByRole('button', { name: /Modifier mes hypothèses/ }).click();
  await page.waitForURL('**/simulation/1');
  assert.equal(await page.locator('input[type=radio]:checked').count(), 3);

  // Lien profond sans étapes remplies → redirection vers la première étape incomplète
  const fresh = await newPage({ width: 390, height: 844 }, true);
  await fresh.goto(`${t.base}/simulation/4`); await fresh.waitForURL('**/simulation/1');
  await fresh.goto(`${t.base}/resultats/introuvable12345`); await fresh.waitForSelector('text=Simulation introuvable');
  await shot(fresh, '12-introuvable');

  // ============ DESKTOP ============
  const desk = await newPage({ width: 1366, height: 900 });
  await desk.goto(t.base); await desk.waitForSelector('h1'); await shot(desk, '13-accueil-desktop');
  await desk.goto(resultsUrl); await desk.waitForSelector('.analysis'); await shot(desk, '14-resultats-desktop');

  // ============ ADMIN ============
  const adm = await newPage({ width: 1366, height: 900 });
  await adm.goto(`${t.base}/admin`);
  await adm.waitForSelector('#a-email'); await shot(adm, '15-admin-login');
  await adm.getByLabel('Email').fill(ADMIN.email); await adm.getByLabel('Mot de passe').fill('mauvais');
  await adm.getByRole('button', { name: 'Se connecter' }).click();
  await adm.waitForSelector('.banner.err');
  await adm.getByLabel('Mot de passe').fill(ADMIN.password);
  await adm.getByRole('button', { name: 'Se connecter' }).click();
  await adm.waitForSelector('.a-grid');
  const dash = await adm.locator('.a-main').innerText();
  assert.match(dash, /Simulations\s*1/); assert.match(dash, /Prospects\s*1/); assert.match(dash, /100\s?%/); assert.match(dash, /Camille/);
  await shot(adm, '16-admin-dashboard');

  await adm.getByRole('link', { name: 'Prospects', exact: true }).click();
  await adm.waitForSelector('table.grid');
  const row = await adm.locator('table.grid tbody tr').first().innerText();
  assert.match(row, /Camille/); assert.match(row, /camille@example\.com/); assert.match(row, /Livraison/); assert.match(row, /linkedin/);
  assert.match(row, /3\s?000\s?€/); assert.match(row, /1\s?556\s?€/);
  await shot(adm, '17-admin-prospects');
  await adm.getByPlaceholder(/Nom, email/).fill('inexistant');
  await adm.waitForSelector('text=Aucun prospect ne correspond');
  await adm.getByPlaceholder(/Nom, email/).fill('durand');
  await adm.waitForSelector('table.grid');
  await adm.getByRole('button', { name: 'Camille' }).click();
  await adm.waitForSelector('dialog[open]'); await shot(adm, '18-admin-detail');
  await adm.getByRole('button', { name: 'Fermer' }).click();
  await adm.locator('table.grid select.badge').selectOption('contacted');
  await adm.waitForSelector('text=Statut mis à jour');
  const [download] = await Promise.all([adm.waitForEvent('download'), adm.getByRole('link', { name: /Exporter en CSV/ }).click()]);
  assert.match(download.suggestedFilename(), /^prospects-capatransport-.*\.csv$/);

  await adm.getByRole('link', { name: 'Paramètres', exact: true }).click();
  await adm.waitForSelector('#s-fuelPrice'); await shot(adm, '19-admin-parametres');
  await adm.locator('#s-fuelPrice').fill('99');
  await adm.getByRole('button', { name: /Enregistrer/ }).click();
  await adm.waitForSelector('.set-row .field-error:visible');
  await adm.locator('#s-fuelPrice').fill('2,10');
  await adm.getByRole('button', { name: /Enregistrer/ }).click();
  await adm.waitForSelector('text=Paramètres enregistrés');
  await adm.reload(); await adm.waitForSelector('#s-fuelPrice');
  assert.equal(await adm.locator('#s-fuelPrice').inputValue(), '2,1');

  // La nouvelle valeur se retrouve dans le simulateur public
  const p2 = await newPage({ width: 390, height: 844 }, true);
  await p2.goto(`${t.base}/simulation/1`);
  await p2.getByText('Transport léger ≤ 3,5 t').click(); await p2.getByText('Livraison', { exact: true }).click(); await p2.getByText('EURL').click();
  await p2.getByRole('button', { name: /Continuer/ }).click(); await p2.waitForURL('**/simulation/2');
  assert.equal(await p2.getByLabel('Prix du carburant').inputValue(), '2,1');

  // Admin sur mobile
  const am = await newPage({ width: 390, height: 844 }, true);
  await am.goto(`${t.base}/admin`); await am.getByLabel('Email').fill(ADMIN.email); await am.getByLabel('Mot de passe').fill(ADMIN.password);
  await am.getByRole('button', { name: 'Se connecter' }).click(); await am.waitForSelector('.a-grid');
  await noHScroll(am, 'admin dashboard mobile'); await shot(am, '20-admin-mobile');
  await am.getByRole('link', { name: 'Paramètres', exact: true }).click(); await am.waitForSelector('#s-fuelPrice');
  await noHScroll(am, 'admin paramètres mobile');

  // Déconnexion
  await adm.getByRole('button', { name: 'Déconnexion' }).click(); await adm.waitForSelector('#a-email');
  await adm.goto(`${t.base}/admin/prospects`); await adm.waitForSelector('#a-email');
} finally {
  await browser.close(); await t.close();
}

const unique = [...new Set(problems)];
if (unique.length) { console.error(`\n${unique.length} problème(s) navigateur :\n${unique.join('\n')}`); process.exit(1); }
console.log('E2E OK — captures dans tests/e2e/out/');
