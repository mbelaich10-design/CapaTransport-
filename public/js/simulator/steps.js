import { h, icon } from '../dom.js';
import { ACTIVITIES, FIELD_LIMITS, LEGAL_STATUSES, TRANSPORT_TYPES, VEHICLE_MODES } from '/shared/rules.js';
import { toNumber } from '/shared/validate.js';
import { eur, num } from '/shared/format.js';
import { choiceField, chips, numberField } from './fields.js';
import { maintenancePerKm } from './state.js';

const fin = (...xs) => xs.every(Number.isFinite);
const n = (v) => toNumber(v ?? '');

/** Chiffres calculés en direct à partir de la saisie en cours (mêmes formules que shared/calc.js). */
export function liveNumbers(draft, s) {
  const { work: w, vehicle: v, charges: c } = draft;
  const days = n(w.daysPerMonth); const trips = n(w.tripsPerDay); const price = n(w.avgPrice); const dist = n(w.avgDistance);
  const revenue = fin(days, trips, price) ? days * trips * price : null;
  const km = fin(days, trips, dist) ? days * trips * dist : null;
  const cons = n(v.consumption); const fp = n(v.fuelPrice);
  const fuel = km != null && fin(cons, fp) ? (km * cons) / 100 * fp : null;
  const rate = maintenancePerKm(draft, s);
  const maintOverride = (c.maintenance ?? '') !== '' ? n(c.maintenance) : null;
  const maintenance = maintOverride != null && Number.isFinite(maintOverride) ? maintOverride : (km != null ? km * rate : null);
  const vehicle = n(v.monthlyCost);
  const others = ['insurance', 'tolls', 'phone', 'software', 'accounting', 'other'].map((k) => n(c[k])).filter(Number.isFinite);
  const total = (Number.isFinite(vehicle) ? vehicle : 0) + (fuel ?? 0) + (maintenance ?? 0) + others.reduce((a, b) => a + b, 0);
  return { revenue, annual: revenue == null ? null : revenue * 12, km, fuel, maintenance, vehicle: Number.isFinite(vehicle) ? vehicle : null, total, rate };
}

const numRow = (label, valueEl, cls = '') => h('div', { class: `live-item ${cls}` }, h('span', null, label), valueEl);

// ---------------------------------------------------------------------------
// Chaque étape retourne { el, fields } ; fields = { 'section.key': champ } pour afficher les erreurs.
// ---------------------------------------------------------------------------

export function stepProject(ctx) {
  const fields = {
    'project.transportType': choiceField(ctx, { path: 'project.transportType', label: 'Quel type de transport souhaitez-vous exercer ?', options: TRANSPORT_TYPES }),
    'project.activity': choiceField(ctx, { path: 'project.activity', label: 'Quelle activité envisagez-vous ?', options: ACTIVITIES, cols: 2 }),
    'project.legalStatus': choiceField(ctx, { path: 'project.legalStatus', label: 'Quel statut envisagez-vous ?', options: LEGAL_STATUSES, cols: 2 }),
  };
  return {
    fields,
    el: h('div', null,
      h('h2', { tabindex: '-1', id: 'step-title' }, 'Parlez-nous de votre projet'),
      h('p', { class: 'step-intro' }, 'Pas d’inquiétude si vous hésitez encore : choisissez « Je ne sais pas encore ».'),
      Object.values(fields).map((f) => f.el)),
  };
}

export function stepVehicle(ctx) {
  const s = ctx.settings;
  const costLabels = {
    credit: ['Mensualité du crédit', 'Montant mensuel remboursé, assurance emprunteur comprise si applicable.'],
    rental: ['Loyer mensuel de la location', 'Loyer mensuel du véhicule (LLD, LOA ou location classique).'],
    cash: ['Coût mensuel estimé du véhicule', 'Un achat comptant a aussi un coût : pensez à amortir le prix d’achat sur sa durée d’usage.'],
    unknown: ['Coût mensuel estimé du véhicule', 'Mensualité, loyer ou amortissement : une estimation suffit pour l’instant.'],
  };
  const cost = numberField(ctx, { path: 'vehicle.monthlyCost', label: '', hint: '', unit: '€ / mois' });
  const labelEl = cost.el.querySelector('label'); const hintEl = h('p', { class: 'field-hint' });
  labelEl.after(hintEl);
  const refreshCost = () => {
    const [l, t] = costLabels[ctx.draft.vehicle.mode] ?? costLabels.unknown;
    labelEl.textContent = l; hintEl.textContent = t;
  };
  refreshCost();
  const prevOnChange = ctx.onChange;
  ctx.onChange = (path) => { if (path === 'vehicle.mode') refreshCost(); prevOnChange?.(path); };

  const fields = {
    'vehicle.owned': choiceField(ctx, { path: 'vehicle.owned', label: 'Possédez-vous déjà le véhicule ?', options: [{ value: 'yes', label: 'Oui' }, { value: 'no', label: 'Non' }], cols: 'yesno' }),
    'vehicle.mode': choiceField(ctx, { path: 'vehicle.mode', label: 'Comment le véhicule est-il (ou sera-t-il) financé ?', options: VEHICLE_MODES, cols: 2 }),
    'vehicle.monthlyCost': cost,
    'vehicle.consumption': numberField(ctx, { path: 'vehicle.consumption', label: 'Consommation moyenne', hint: `Valeur indicative pré-remplie (${String(ctx.heavy ? s.consumptionHeavy : s.consumptionLight).replace('.', ',')} L/100 km) : remplacez-la par celle de votre véhicule.`, unit: 'L / 100 km' }),
    'vehicle.fuelPrice': numberField(ctx, { path: 'vehicle.fuelPrice', label: 'Prix du carburant', hint: 'Prix moyen au litre que vous comptez payer.', unit: '€ / litre' }),
  };
  return {
    fields,
    el: h('div', null,
      h('h2', { tabindex: '-1', id: 'step-title' }, 'Votre véhicule'),
      h('p', { class: 'step-intro' }, 'Le véhicule est en général le premier poste de dépenses.'),
      Object.values(fields).map((f) => f.el)),
  };
}

export function stepWork(ctx) {
  const L = FIELD_LIMITS;
  const fields = {
    'work.daysPerMonth': numberField(ctx, { path: 'work.daysPerMonth', label: 'Jours travaillés par mois', hint: 'Jours où vous roulez réellement, congés et jours sans activité déduits.', unit: 'jours', decimal: false, placeholder: '20' }),
    'work.tripsPerDay': numberField(ctx, { path: 'work.tripsPerDay', label: 'Nombre de courses par jour', hint: 'Une course = une livraison ou un trajet facturé.', unit: 'courses', decimal: false, placeholder: 'ex. 6' }),
    'work.avgPrice': numberField(ctx, { path: 'work.avgPrice', label: 'Prix moyen d’une course', hint: 'Montant moyen facturé, hors taxes.', unit: '€', placeholder: 'ex. 25' }),
    'work.avgDistance': numberField(ctx, { path: 'work.avgDistance', label: 'Distance moyenne d’une course', hint: 'Kilomètres parcourus en moyenne par course, retour à vide inclus.', unit: 'km', placeholder: 'ex. 20' }),
  };
  const out = {
    ca: h('strong', null, '—'), caAnnual: h('strong', null, '—'), km: h('strong', null, '—'), fuel: h('strong', null, '—'),
  };
  const live = h('section', { class: 'live', 'aria-live': 'polite' },
    h('h3', null, 'Votre estimation en direct'),
    h('div', { class: 'live-grid' },
      numRow('Chiffre d’affaires mensuel', out.ca, 'big'),
      numRow('Chiffre d’affaires annuel', out.caAnnual),
      numRow('Kilométrage mensuel', out.km),
      numRow('Carburant mensuel', out.fuel)));
  const refresh = () => {
    const l = liveNumbers(ctx.draft, ctx.settings);
    out.ca.textContent = l.revenue == null ? '—' : eur(l.revenue);
    out.caAnnual.textContent = l.annual == null ? '—' : eur(l.annual);
    out.km.textContent = l.km == null ? '—' : `${num(l.km)} km`;
    out.fuel.textContent = l.fuel == null ? '—' : eur(l.fuel);
  };
  const prev = ctx.onChange; ctx.onChange = (p) => { refresh(); prev?.(p); }; refresh();
  void L;
  return {
    fields,
    el: h('div', null,
      h('h2', { tabindex: '-1', id: 'step-title' }, 'Votre activité'),
      h('p', { class: 'step-intro' }, 'Ces hypothèses sont les vôtres : la simulation vaut ce que valent ces chiffres.'),
      h('div', { class: 'form-grid two' }, Object.values(fields).map((f) => f.el)),
      live),
  };
}

export function stepCharges(ctx) {
  const s = ctx.settings;
  const heavy = ctx.heavy;
  const money = (path, label, hint, extra = {}) => numberField(ctx, { path, label, hint, unit: '€ / mois', ...extra });
  const fields = {
    'charges.insurance': money('charges.insurance', 'Assurance', 'Valeur indicative : remplacez-la par votre devis.'),
    'charges.maintenance': numberField(ctx, { path: 'charges.maintenance', label: 'Entretien', hint: 'Laissez vide pour utiliser l’estimation automatique.', unit: '€ / mois', placeholder: 'Automatique', note: true }),
    'charges.tolls': money('charges.tolls', 'Péages', 'Selon vos itinéraires habituels.'),
    'charges.phone': money('charges.phone', 'Téléphone', 'Forfait mobile professionnel.'),
    'charges.software': money('charges.software', 'Logiciel', 'Facturation, gestion, navigation…'),
    'charges.accounting': money('charges.accounting', 'Comptabilité', 'Expert-comptable ou outil de compta en ligne.'),
    'charges.other': money('charges.other', 'Autres charges', 'Tenue, frais bancaires, cotisations professionnelles, imprévus…'),
  };
  const vehicleV = h('b'); const fuelV = h('b'); const totalV = h('strong', null, '—');
  const recap = h('div', null,
    h('div', { class: 'charge-line' }, h('span', null, 'Véhicule', h('small', null, 'Repris de l’étape « Mon véhicule »')), vehicleV),
    h('div', { class: 'charge-line' }, h('span', null, 'Carburant', h('small', null, 'Calculé : kilométrage × consommation × prix du litre')), fuelV));
  const live = h('section', { class: 'live', 'aria-live': 'polite' },
    h('h3', null, 'Charges mensuelles estimées'), h('div', { class: 'live-grid' }, numRow('Total par mois', totalV, 'big')));
  const maint = fields['charges.maintenance'];
  const refresh = () => {
    const l = liveNumbers(ctx.draft, s);
    vehicleV.textContent = l.vehicle == null ? '—' : eur(l.vehicle);
    fuelV.textContent = l.fuel == null ? '—' : eur(l.fuel);
    totalV.textContent = eur(l.total);
    const rateTxt = String(l.rate).replace('.', ',');
    maint.noteEl.textContent = (ctx.draft.charges.maintenance ?? '') === ''
      ? (l.km != null ? `Estimation automatique : ${eur(l.km * l.rate)} par mois (${rateTxt} €/km × ${num(l.km)} km)` : `Estimation automatique : ${rateTxt} € par km parcouru`)
      : '';
  };
  const prev = ctx.onChange; ctx.onChange = (p) => { refresh(); prev?.(p); }; refresh();
  void heavy;
  return {
    fields,
    el: h('div', null,
      h('h2', { tabindex: '-1', id: 'step-title' }, 'Vos charges mensuelles'),
      h('p', { class: 'step-intro' }, 'Nous avons pré-rempli des valeurs indicatives. Modifiez-les avec vos propres chiffres pour un résultat plus fiable.'),
      recap,
      h('div', { class: 'form-grid two' }, Object.values(fields).map((f) => f.el)),
      live),
  };
}

export function stepTarget(ctx) {
  const s = ctx.settings;
  const f = numberField(ctx, { path: 'target.income', label: 'Quel revenu mensuel souhaitez-vous dégager ?', hint: 'Le montant que vous aimeriez vous verser chaque mois, avant cotisations sociales et impôts.', unit: '€ / mois', decimal: false, placeholder: 'ex. 2000' });
  const picks = chips(s.targetIncomePresets, (v) => { f.input.value = String(v); f.input.dispatchEvent(new Event('input', { bubbles: true })); }, (v) => eur(v));
  f.el.append(picks);
  return {
    fields: { 'target.income': f },
    el: h('div', null,
      h('h2', { tabindex: '-1', id: 'step-title' }, 'Votre objectif de revenu'),
      h('p', { class: 'step-intro' }, 'Nous calculerons le chiffre d’affaires nécessaire pour l’atteindre, selon vos hypothèses.'),
      f.el),
  };
}

export const STEP_BUILDERS = [stepProject, stepVehicle, stepWork, stepCharges, stepTarget];
export { icon };
