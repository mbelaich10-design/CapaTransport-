import test from 'node:test';
import assert from 'node:assert/strict';
import { toNumber, validateLead, validateSimulationInput } from '../shared/validate.js';
import { validInput } from './helpers.js';

const errorsFor = (mut) => { const i = validInput(); mut(i); return validateSimulationInput(i).errors; };

test('entrée valide → ok et normalisée', () => {
  const v = validateSimulationInput(validInput());
  assert.equal(v.ok, true);
  assert.equal(v.value.charges.maintenance, null);
});

test('toNumber accepte virgule, espaces, refuse le reste', () => {
  assert.equal(toNumber('8,5'), 8.5);
  assert.equal(toNumber('1 234,50'), 1234.5);
  assert.equal(toNumber(12), 12);
  for (const bad of ['abc', '', '1e3', '12abc', NaN, Infinity, null, undefined, {}, [], '--1']) assert.ok(Number.isNaN(toNumber(bad)), String(bad));
});

test('bornes : valeurs incohérentes refusées', () => {
  assert.ok(errorsFor((i) => { i.work.daysPerMonth = 0; })['work.daysPerMonth']);
  assert.ok(errorsFor((i) => { i.work.daysPerMonth = 32; })['work.daysPerMonth']);
  assert.ok(errorsFor((i) => { i.work.daysPerMonth = 20.5; })['work.daysPerMonth']);
  assert.ok(errorsFor((i) => { i.work.avgPrice = -5; })['work.avgPrice']);
  assert.ok(errorsFor((i) => { i.work.avgPrice = 0; })['work.avgPrice']);
  assert.ok(errorsFor((i) => { i.vehicle.consumption = 500; })['vehicle.consumption']);
  assert.ok(errorsFor((i) => { i.vehicle.fuelPrice = 0; })['vehicle.fuelPrice']);
  assert.ok(errorsFor((i) => { i.charges.tolls = -1; })['charges.tolls']);
  assert.ok(errorsFor((i) => { i.target.income = 10; })['target.income']);
  assert.ok(errorsFor((i) => { i.target.income = 99999999; })['target.income']);
});

test('champs manquants et types invalides', () => {
  const e = validateSimulationInput({}).errors;
  for (const k of ['project.transportType', 'vehicle.owned', 'work.daysPerMonth', 'charges.insurance', 'target.income']) assert.ok(e[k], k);
  assert.ok(errorsFor((i) => { i.project.activity = 'hacker'; })['project.activity']);
  assert.ok(errorsFor((i) => { i.work.tripsPerDay = 'beaucoup'; })['work.tripsPerDay']);
  assert.equal(validateSimulationInput(null).ok, false);
  assert.equal(validateSimulationInput('x').ok, false);
});

test('cohérence croisée : km/jour irréaliste et crédit sans mensualité', () => {
  assert.match(errorsFor((i) => { i.work.tripsPerDay = 50; i.work.avgDistance = 100; })['work.avgDistance'], /Incohérent/);
  assert.ok(errorsFor((i) => { i.vehicle.mode = 'credit'; i.vehicle.monthlyCost = 0; })['vehicle.monthlyCost']);
  assert.ok(errorsFor((i) => { i.vehicle.mode = 'rental'; i.vehicle.monthlyCost = 0; })['vehicle.monthlyCost']);
  assert.equal(Object.keys(errorsFor((i) => { i.vehicle.owned = true; i.vehicle.mode = 'cash'; i.vehicle.monthlyCost = 0; })).length, 0);
});

test('les clés inconnues sont ignorées (pas de pollution)', () => {
  const i = validInput(); i.work.__proto__x = 1; i.evil = { $ne: 1 }; i.work.extra = 5;
  const v = validateSimulationInput(i);
  assert.equal(v.value.evil, undefined);
  assert.equal(v.value.work.extra, undefined);
});

test('prospect : validation et normalisation', () => {
  const ok = validateLead({ firstName: '  Camille ', lastName: 'Durand', email: ' Camille@Example.COM ', phone: '+33 6 12 34 56 78', marketingConsent: true });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.email, 'camille@example.com');
  assert.equal(ok.value.firstName, 'Camille');
  assert.equal(validateLead({ firstName: 'A', lastName: 'B', email: 'a@b.fr' }).value.phone, null);
  assert.equal(validateLead({ firstName: 'A', lastName: 'B', email: 'a@b.fr', marketingConsent: 'true' }).value.marketingConsent, false);
  for (const email of ['', 'pas-un-email', 'a@b', 'a b@c.fr', '<x>@y.fr', 'a@b.fr,c@d.fr']) assert.ok(validateLead({ firstName: 'A', lastName: 'B', email }).errors.email, email);
  assert.ok(validateLead({ firstName: '', lastName: 'B', email: 'a@b.fr' }).errors.firstName);
  assert.ok(validateLead({ firstName: '<script>', lastName: 'B', email: 'a@b.fr' }).errors.firstName);
  assert.ok(validateLead({ firstName: 'x'.repeat(81), lastName: 'B', email: 'a@b.fr' }).errors.firstName);
  assert.ok(validateLead({ firstName: 'A', lastName: 'B', email: 'a@b.fr', phone: 'abc' }).errors.phone);
  assert.ok(validateLead({ firstName: 'A', lastName: 'B', email: 'a@b.fr', phone: '123' }).errors.phone);
});
