// Validation et normalisation des saisies — exécutée à l'identique dans le navigateur
// (messages en direct) et sur le serveur (source de vérité). Aucune dépendance.
import {
  ACTIVITIES, FIELD_LIMITS, LEGAL_STATUSES, MAX_KM_PER_DAY, TRANSPORT_TYPES, VEHICLE_MODES,
} from './rules.js';

const isEmpty = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Convertit une saisie ("1 234,5", 12, "12.5") en nombre, ou NaN. */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.replace(/[\s  ]/g, '').replace(',', '.').replace(/€|km|l$/gi, '');
  if (s === '' || !/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return NaN;
  return Number(s);
}

const round2 = (n) => Math.round(n * 100) / 100;
const fmtLimit = (n) => String(n).replace('.', ',');

function numberField(raw, key, errors, path, { optional = false } = {}) {
  const lim = FIELD_LIMITS[key];
  if (isEmpty(raw)) {
    if (optional) return null;
    errors[path] = `${lim.label} : champ obligatoire.`;
    return null;
  }
  const n = toNumber(raw);
  if (Number.isNaN(n)) {
    errors[path] = `${lim.label} : saisissez un nombre valide.`;
    return null;
  }
  if (lim.integer && !Number.isInteger(n)) {
    errors[path] = `${lim.label} : saisissez un nombre entier.`;
    return null;
  }
  if (n < lim.min || n > lim.max) {
    errors[path] = `${lim.label} : la valeur doit être comprise entre ${fmtLimit(lim.min)} et ${fmtLimit(lim.max)} ${lim.unit}.`;
    return null;
  }
  return round2(n);
}

function enumField(raw, list, label, errors, path) {
  if (isEmpty(raw)) { errors[path] = `${label} : merci de faire un choix.`; return null; }
  if (!list.some((o) => o.value === raw)) { errors[path] = `${label} : choix invalide.`; return null; }
  return raw;
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function validateProject(input) {
  const errors = {}; const src = obj(input);
  const value = {
    transportType: enumField(src.transportType, TRANSPORT_TYPES, 'Type de transport', errors, 'project.transportType'),
    activity: enumField(src.activity, ACTIVITIES, 'Activité', errors, 'project.activity'),
    legalStatus: enumField(src.legalStatus, LEGAL_STATUSES, 'Statut', errors, 'project.legalStatus'),
  };
  return { errors, value };
}

export function validateVehicle(input) {
  const errors = {}; const src = obj(input);
  let owned = null;
  if (typeof src.owned === 'boolean') owned = src.owned;
  else if (src.owned === 'yes' || src.owned === 'no') owned = src.owned === 'yes';
  else errors['vehicle.owned'] = 'Véhicule déjà possédé : merci de répondre.';
  const mode = enumField(src.mode, VEHICLE_MODES, 'Mode de financement', errors, 'vehicle.mode');
  const monthlyCost = numberField(src.monthlyCost, 'vehicleMonthlyCost', errors, 'vehicle.monthlyCost');
  if (monthlyCost === 0 && (mode === 'credit' || mode === 'rental')) {
    errors['vehicle.monthlyCost'] = 'Indiquez la mensualité ou le loyer (supérieur à 0 €) pour un crédit ou une location.';
  }
  const consumption = numberField(src.consumption, 'consumption', errors, 'vehicle.consumption');
  const fuelPrice = numberField(src.fuelPrice, 'fuelPrice', errors, 'vehicle.fuelPrice');
  return { errors, value: { owned, mode, monthlyCost, consumption, fuelPrice } };
}

export function validateWork(input) {
  const errors = {}; const src = obj(input);
  const value = {
    daysPerMonth: numberField(src.daysPerMonth, 'daysPerMonth', errors, 'work.daysPerMonth'),
    tripsPerDay: numberField(src.tripsPerDay, 'tripsPerDay', errors, 'work.tripsPerDay'),
    avgPrice: numberField(src.avgPrice, 'avgPrice', errors, 'work.avgPrice'),
    avgDistance: numberField(src.avgDistance, 'avgDistance', errors, 'work.avgDistance'),
  };
  if (value.tripsPerDay != null && value.avgDistance != null) {
    const km = value.tripsPerDay * value.avgDistance;
    if (km > MAX_KM_PER_DAY) {
      errors['work.avgDistance'] = `Incohérent : ${Math.round(km)} km par jour (${MAX_KM_PER_DAY} km maximum). Réduisez le nombre de courses ou la distance moyenne.`;
    }
  }
  return { errors, value };
}

const CHARGE_KEYS = [
  ['insurance', 'insurance'], ['tolls', 'tolls'], ['phone', 'phone'],
  ['software', 'software'], ['accounting', 'accounting'], ['other', 'otherCharges'],
];

export function validateCharges(input) {
  const errors = {}; const src = obj(input);
  const value = {};
  for (const [key, limKey] of CHARGE_KEYS) value[key] = numberField(src[key], limKey, errors, `charges.${key}`);
  // Entretien : vide = estimation automatique au coût/km.
  value.maintenance = numberField(src.maintenance, 'maintenance', errors, 'charges.maintenance', { optional: true });
  return { errors, value };
}

export function validateTarget(input) {
  const errors = {}; const src = obj(input);
  return { errors, value: { income: numberField(src.income, 'targetIncome', errors, 'target.income') } };
}

export const STEP_VALIDATORS = { project: validateProject, vehicle: validateVehicle, work: validateWork, charges: validateCharges, target: validateTarget };

/** Valide la simulation complète. Retourne { ok, errors, value } (value = données normalisées). */
export function validateSimulationInput(input) {
  const src = obj(input);
  const errors = {}; const value = {};
  for (const [section, fn] of Object.entries(STEP_VALIDATORS)) {
    const r = fn(src[section]);
    Object.assign(errors, r.errors);
    value[section] = r.value;
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
}

// ---- Prospect --------------------------------------------------------------

const EMAIL_RE = /^[^\s@<>()[\],;:\\"]+@[^\s@<>()[\],;:\\"]+\.[^\s@<>()[\],;:\\"]{2,}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

function nameField(raw, label, errors, path) {
  const s = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (!s) { errors[path] = `${label} : champ obligatoire.`; return ''; }
  if (s.length > 80) { errors[path] = `${label} : 80 caractères maximum.`; return ''; }
  if (CONTROL_RE.test(s) || /[<>]/.test(s)) { errors[path] = `${label} : caractères non autorisés.`; return ''; }
  return s;
}

export function validateLead(input) {
  const src = obj(input); const errors = {};
  const firstName = nameField(src.firstName, 'Prénom', errors, 'firstName');
  const lastName = nameField(src.lastName, 'Nom', errors, 'lastName');

  const email = typeof src.email === 'string' ? src.email.trim().toLowerCase() : '';
  if (!email) errors.email = 'Email : champ obligatoire.';
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = 'Email : adresse invalide.';

  let phone = null;
  if (!isEmpty(src.phone)) {
    const p = String(src.phone).trim();
    const digits = p.replace(/\D/g, '');
    if (!/^\+?[\d\s.()-]+$/.test(p) || digits.length < 8 || digits.length > 15) {
      errors.phone = 'Téléphone : numéro invalide (8 à 15 chiffres).';
    } else phone = p.replace(/\s+/g, ' ');
  }
  return { ok: Object.keys(errors).length === 0, errors, value: { firstName, lastName, email, phone, marketingConsent: src.marketingConsent === true } };
}
