import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, previewOf, monthlyKm } from '../shared/calc.js';
import { buildAnalysis } from '../shared/analysis.js';
import { validateSimulationInput } from '../shared/validate.js';
import { validInput } from './helpers.js';

const run = (mut = () => {}, assumptions = { maintenancePerKm: 0.08 }) => {
  const input = validInput(); mut(input);
  const v = validateSimulationInput(input);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
  return simulate(v.value, assumptions);
};

test('formules de base : CA, km, carburant (exemple de référence)', () => {
  const r = run();
  assert.equal(r.monthly.revenue, 3000);              // 20 × 6 × 25
  assert.equal(r.annual.revenue, 36000);              // × 12
  assert.equal(r.monthly.km, 2400);                   // 20 × 6 × 20
  assert.equal(r.monthly.lines.fuel, 377.4);          // 2400 × 8,5 / 100 × 1,85
  assert.equal(r.monthly.lines.maintenance, 192);     // 2400 × 0,08 (auto)
  assert.equal(r.monthly.totalCharges, 1444.4);
  assert.equal(r.monthly.result, 1555.6);
  assert.equal(r.annual.totalCharges, 17332.8);
  assert.equal(r.annual.result, 18667.2);
  assert.equal(r.marginPct, 51.85);
  assert.equal(r.assumptions.maintenanceAuto, true);
});

test('seuil de rentabilité : le résultat est nul au CA calculé', () => {
  const r = run();
  // fixes 815 / (1 - 629,4/3000)
  assert.equal(r.monthly.fixedCharges, 815);
  assert.equal(r.monthly.variableCharges, 629.4);
  assert.ok(Math.abs(r.breakEven.revenue - 1031.38) < 0.01);
  const ratio = r.monthly.variableCharges / r.monthly.revenue;
  assert.ok(Math.abs(r.breakEven.revenue * (1 - ratio) - r.monthly.fixedCharges) < 0.01);
  assert.ok(r.breakEven.coverage > 1);
});

test('CA nécessaire pour un objectif de revenu', () => {
  const r = run();
  assert.ok(Math.abs(r.target.revenueNeeded - 3562.39) < 0.01);
  assert.equal(r.target.achieved, false);
  assert.ok(Math.abs(r.target.gap - 562.39) < 0.01);
  // Vérification croisée : à ce CA, le résultat vaut l'objectif.
  const ratio = r.monthly.variableCharges / r.monthly.revenue;
  const resultAt = r.target.revenueNeeded * (1 - ratio) - r.monthly.fixedCharges;
  assert.ok(Math.abs(resultAt - 2000) < 0.01);
  const easy = run((i) => { i.target.income = 500; });
  assert.equal(easy.target.achieved, true);
  assert.ok(easy.target.gap < 0);
});

test('entretien saisi manuellement : remplace l’estimation au km', () => {
  const r = run((i) => { i.charges.maintenance = 50; });
  assert.equal(r.monthly.lines.maintenance, 50);
  assert.equal(r.assumptions.maintenanceAuto, false);
});

test('résultat négatif : activité déficitaire', () => {
  const r = run((i) => { i.work.avgPrice = 8; });
  assert.ok(r.monthly.result < 0);
  assert.ok(r.marginPct < 0);
  assert.match(buildAnalysis(r).find((a) => a.id === 'result').text, /déficitaire/);
});

test('charges variables ≥ CA : seuil et objectif inatteignables (pas de division par zéro)', () => {
  const r = run((i) => { i.work.avgPrice = 2; i.work.avgDistance = 50; i.work.tripsPerDay = 10; });
  assert.equal(r.breakEven.reachable, false);
  assert.equal(r.breakEven.revenue, null);
  assert.equal(r.target.reachable, false);
  assert.equal(r.target.revenueNeeded, null);
  assert.ok(buildAnalysis(r).every((a) => !/NaN|Infinity/.test(a.text)));
});

test('objectif au-delà du calendrier : signalé', () => {
  const r = run((i) => { i.target.income = 20000; });
  assert.equal(r.target.exceedsCalendar, true);
  assert.match(buildAnalysis(r).find((a) => a.id === 'target').text, /dépasserait le nombre de jours/);
});

test('charges toutes nulles : pas de NaN, marge 100 %', () => {
  const r = run((i) => {
    i.vehicle.owned = true; i.vehicle.mode = 'cash'; i.vehicle.monthlyCost = 0; i.vehicle.consumption = 1; i.vehicle.fuelPrice = 0.5;
    Object.assign(i.charges, { insurance: 0, maintenance: 0, tolls: 0, phone: 0, software: 0, accounting: 0, other: 0 });
  });
  assert.ok(Number.isFinite(r.marginPct));
  assert.ok(r.breakEven.revenue >= 0);
  const text = buildAnalysis(r).map((a) => a.text).join(' ');
  assert.doesNotMatch(text, /NaN|Infinity|undefined/);
});

test('aucune valeur non finie dans le résultat', () => {
  const r = run();
  JSON.stringify(r, (k, v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v), k); return v; });
});

test('aperçu (avant capture) : n’expose ni marge, ni seuil, ni objectif, ni détail des charges', () => {
  const p = previewOf(run());
  assert.deepEqual(Object.keys(p.monthly).sort(), ['result', 'revenue', 'totalCharges']);
  assert.equal(p.breakEven, undefined);
  assert.equal(p.target, undefined);
  assert.equal(p.marginPct, undefined);
});

test('avertissements de plausibilité', () => {
  const r = run((i) => { i.work.daysPerMonth = 30; i.vehicle.mode = 'unknown'; });
  const codes = r.warnings.map((w) => w.code);
  assert.ok(codes.includes('many_days'));
  assert.ok(codes.includes('vehicle_mode_unknown'));
  assert.equal(monthlyKm({ daysPerMonth: 2, tripsPerDay: 3, avgDistance: 4 }), 24);
});

test('l’analyse ne promet jamais un revenu', () => {
  const text = buildAnalysis(run()).map((a) => a.text).join(' ').toLowerCase();
  assert.doesNotMatch(text, /garanti|assuré|vous gagnerez|vous allez gagner/);
});
