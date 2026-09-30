// Moteur de calcul du simulateur — pur, déterministe, sans dépendance.
// Utilisé côté navigateur (aperçu live) et côté serveur (résultat autoritaire enregistré).
import { PLAUSIBILITY } from './rules.js';

export const CALC_VERSION = 1;

const r2 = (n) => Math.round(n * 100) / 100;

// Postes proportionnels à l'activité (varient avec le CA) vs postes fixes.
export const VARIABLE_CHARGES = ['fuel', 'maintenance', 'tolls'];
export const FIXED_CHARGES = ['vehicle', 'insurance', 'phone', 'software', 'accounting', 'other'];
export const CHARGE_LABELS = {
  vehicle: 'Véhicule', fuel: 'Carburant', insurance: 'Assurance', maintenance: 'Entretien',
  tolls: 'Péages', phone: 'Téléphone', software: 'Logiciel', accounting: 'Comptabilité', other: 'Autres charges',
};

/** Kilométrage mensuel — utile aussi à l'interface pour estimer l'entretien. */
export function monthlyKm(work) {
  return work.daysPerMonth * work.tripsPerDay * work.avgDistance;
}

/**
 * @param input  saisies déjà validées/normalisées (voir shared/validate.js)
 * @param assumptions { maintenancePerKm } — hypothèses issues des paramètres au moment du calcul
 */
export function simulate(input, assumptions) {
  const { work, vehicle, charges, target } = input;

  const revenue = work.daysPerMonth * work.tripsPerDay * work.avgPrice;
  const km = monthlyKm(work);
  const fuel = (km * vehicle.consumption / 100) * vehicle.fuelPrice;
  const maintenanceAuto = charges.maintenance == null;
  const maintenance = maintenanceAuto ? km * assumptions.maintenancePerKm : charges.maintenance;

  const lines = {
    vehicle: vehicle.monthlyCost,
    fuel,
    insurance: charges.insurance,
    maintenance,
    tolls: charges.tolls,
    phone: charges.phone,
    software: charges.software,
    accounting: charges.accounting,
    other: charges.other,
  };
  const sum = (keys) => keys.reduce((t, k) => t + lines[k], 0);
  const fixed = sum(FIXED_CHARGES);
  const variable = sum(VARIABLE_CHARGES);
  const totalCharges = fixed + variable;
  const result = revenue - totalCharges;
  const margin = revenue > 0 ? result / revenue : null;

  // Seuil de rentabilité : CA pour lequel résultat = 0, en gardant la même structure
  // de coûts variables (ratio charges variables / CA constant).
  const variableRatio = revenue > 0 ? variable / revenue : 1;
  const contribution = 1 - variableRatio; // part de chaque € de CA qui couvre les charges fixes
  const dailyRevenue = revenue / work.daysPerMonth;
  const daysFor = (ca) => (dailyRevenue > 0 ? ca / dailyRevenue : null);

  let breakEven;
  if (contribution > 0) {
    const ca = fixed / contribution;
    breakEven = { reachable: true, revenue: r2(ca), days: r2(daysFor(ca)), coverage: ca > 0 ? revenue / ca : null };
  } else {
    breakEven = { reachable: false, revenue: null, days: null, coverage: null };
  }

  // CA nécessaire pour dégager le revenu souhaité (avant cotisations sociales et impôts).
  let targetOut;
  if (contribution > 0) {
    const ca = (fixed + target.income) / contribution;
    const days = daysFor(ca);
    targetOut = {
      income: target.income,
      reachable: true,
      revenueNeeded: r2(ca),
      gap: r2(ca - revenue), // > 0 : il manque du CA ; ≤ 0 : objectif atteint
      achieved: result >= target.income,
      daysNeeded: r2(days),
      exceedsCalendar: days > 31,
    };
  } else {
    targetOut = { income: target.income, reachable: false, revenueNeeded: null, gap: null, achieved: false, daysNeeded: null, exceedsCalendar: false };
  }

  const warnings = [];
  const revenuePerKm = km > 0 ? revenue / km : null;
  if (revenuePerKm != null && revenuePerKm < PLAUSIBILITY.revenuePerKmMin) warnings.push({ code: 'revenue_per_km_low', value: r2(revenuePerKm) });
  if (revenuePerKm != null && revenuePerKm > PLAUSIBILITY.revenuePerKmMax) warnings.push({ code: 'revenue_per_km_high', value: r2(revenuePerKm) });
  if (work.daysPerMonth > PLAUSIBILITY.daysWarn) warnings.push({ code: 'many_days', value: work.daysPerMonth });
  if (vehicle.mode === 'unknown') warnings.push({ code: 'vehicle_mode_unknown' });
  if (vehicle.monthlyCost === 0) warnings.push({ code: 'vehicle_cost_zero' });

  const roundedLines = Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, r2(v)]));
  return {
    calcVersion: CALC_VERSION,
    assumptions: { maintenancePerKm: assumptions.maintenancePerKm, maintenanceAuto },
    monthly: {
      revenue: r2(revenue),
      km: r2(km),
      lines: roundedLines,
      fixedCharges: r2(fixed),
      variableCharges: r2(variable),
      totalCharges: r2(totalCharges),
      result: r2(result),
    },
    annual: { revenue: r2(revenue * 12), totalCharges: r2(totalCharges * 12), result: r2(result * 12) },
    marginPct: margin == null ? null : r2(margin * 100),
    breakEven,
    target: targetOut,
    unit: {
      revenuePerDay: r2(dailyRevenue),
      resultPerDay: r2(result / work.daysPerMonth),
      revenuePerKm: revenuePerKm == null ? null : r2(revenuePerKm),
      chargesPerKm: km > 0 ? r2(totalCharges / km) : null,
    },
    warnings,
  };
}

/** Partie du résultat visible AVANT la capture du prospect (le reste est débloqué ensuite). */
export function previewOf(results) {
  return {
    calcVersion: results.calcVersion,
    monthly: {
      revenue: results.monthly.revenue,
      totalCharges: results.monthly.totalCharges,
      result: results.monthly.result,
    },
    annual: { revenue: results.annual.revenue, totalCharges: results.annual.totalCharges, result: results.annual.result },
  };
}
