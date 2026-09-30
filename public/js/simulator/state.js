import { store } from '../dom.js';

const DRAFT_KEY = 'ct:draft:v1';
export const LAST_SIM_KEY = 'ct:last-simulation';

export const SECTIONS = ['project', 'vehicle', 'work', 'charges', 'target'];
export const STEP_TITLES = ['Mon projet', 'Mon véhicule', 'Mon activité', 'Mes charges', 'Mon objectif'];

export const emptyDraft = () => ({ project: {}, vehicle: {}, work: {}, charges: {}, target: {}, touched: {} });

export function loadDraft() {
  const d = store.get(DRAFT_KEY);
  if (!d || typeof d !== 'object') return emptyDraft();
  return { ...emptyDraft(), ...d, touched: d.touched ?? {} };
}
export const saveDraft = (d) => store.set(DRAFT_KEY, d);
export const clearDraft = () => store.del(DRAFT_KEY);

export const isHeavy = (draft) => draft.project.transportType === 'heavy';

/** Valeurs par défaut (issues des paramètres admin) — appliquées seulement aux champs que l'utilisateur n'a pas modifiés. */
export function defaultsFor(draft, s) {
  const heavy = isHeavy(draft);
  return {
    'vehicle.consumption': heavy ? s.consumptionHeavy : s.consumptionLight,
    'vehicle.fuelPrice': s.fuelPrice,
    'vehicle.monthlyCost': heavy ? s.vehicleMonthlyHeavy : s.vehicleMonthlyLight,
    'work.daysPerMonth': s.daysPerMonthDefault,
    'charges.insurance': heavy ? s.insuranceHeavy : s.insuranceLight,
    'charges.tolls': s.tolls,
    'charges.phone': s.phone,
    'charges.software': s.software,
    'charges.accounting': s.accounting,
    'charges.other': s.otherCharges,
  };
}

export function applyDefaults(draft, settings) {
  for (const [path, value] of Object.entries(defaultsFor(draft, settings))) {
    if (draft.touched[path]) continue;
    const [section, key] = path.split('.');
    draft[section][key] = String(value).replace('.', ',');
  }
}

export const maintenancePerKm = (draft, s) => (isHeavy(draft) ? s.maintenancePerKmHeavy : s.maintenancePerKmLight);

/** Tracking marketing : jetons utm_* / ref, ou domaine référent. Conservé pour la session. */
export function captureTracking() {
  try {
    const q = new URLSearchParams(location.search);
    const fromUrl = q.get('utm_source') || q.get('source') || q.get('src');
    if (fromUrl || q.get('utm_medium') || q.get('utm_campaign')) {
      sessionStorage.setItem('ct:track', JSON.stringify({ source: fromUrl, utmMedium: q.get('utm_medium'), utmCampaign: q.get('utm_campaign') }));
    } else if (!sessionStorage.getItem('ct:track') && document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== location.hostname) sessionStorage.setItem('ct:track', JSON.stringify({ source: `ref:${host.replace(/^www\./, '')}` }));
    }
  } catch { /* ignoré */ }
}
export function getTracking() {
  try { return JSON.parse(sessionStorage.getItem('ct:track') || '{}'); } catch { return {}; }
}
