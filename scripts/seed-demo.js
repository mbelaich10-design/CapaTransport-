// DÉVELOPPEMENT UNIQUEMENT : crée des simulations et prospects fictifs pour explorer l'administration.
// Usage : npm run seed:demo   (refuse de tourner en production)
import { loadEnv } from '../src/config/env.js';
import { openDatabase } from '../src/db/index.js';
import { createApp } from '../src/app.js';

const env = loadEnv();
if (env.production) { console.error('Refus : NODE_ENV=production.'); process.exit(1); }
const db = openDatabase(env.dbPath);
const { services } = createApp({ db, env });

const first = ['Camille', 'Léa', 'Karim', 'Sofia', 'Thomas', 'Inès', 'Mehdi', 'Julie'];
const last = ['Durand', 'Martin', 'Bernard', 'Petit', 'Robert', 'Moreau', 'Simon', 'Laurent'];
const acts = ['delivery', 'courier', 'subcontracting', 'moving', 'freight', 'other'];
const sources = ['linkedin', 'facebook', 'google', 'direct', 'ref:youtube.com'];
const pick = (a, i) => a[i % a.length];

for (let i = 0; i < 24; i += 1) {
  const heavy = i % 4 === 0;
  const sim = services.simulationService.create({
    project: { transportType: heavy ? 'heavy' : i % 7 === 0 ? 'unknown' : 'light', activity: pick(acts, i), legalStatus: pick(['micro', 'ei', 'eurl', 'sasu', 'unknown'], i) },
    vehicle: { owned: i % 2 === 0, mode: pick(['credit', 'rental', 'cash', 'unknown'], i), monthlyCost: heavy ? 1800 : 450 + (i % 3) * 60, consumption: heavy ? 28 : 8.5, fuelPrice: 1.85 },
    work: { daysPerMonth: 16 + (i % 8), tripsPerDay: 3 + (i % 6), avgPrice: 18 + (i % 9) * 6, avgDistance: 12 + (i % 5) * 9 },
    charges: { insurance: heavy ? 450 : 120, maintenance: null, tolls: 60, phone: 30, software: 25, accounting: 90, other: 100 },
    target: { income: 1500 + (i % 4) * 500 },
  }, { source: pick(sources, i), utmMedium: i % 2 ? 'social' : null });
  if (i % 3 !== 2) {
    await services.simulationService.captureLead(sim.id, {
      firstName: pick(first, i), lastName: pick(last, i + 3), email: `demo${i}@example.com`, phone: i % 2 ? `06 12 34 56 ${String(10 + i)}` : '', marketingConsent: i % 3 === 0,
    });
  }
}
console.log('24 simulations démo créées (16 avec prospect).');
db.close();
