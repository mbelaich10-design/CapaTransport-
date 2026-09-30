// Analyse automatique en langage clair, construite UNIQUEMENT à partir des données saisies.
// Jamais de promesse de revenu : formulations conditionnelles ("avec vos hypothèses actuelles").
import { CHARGE_LABELS } from './calc.js';
import { eur, num1, pct } from './format.js';

export const DISCLAIMER =
  'Simulation indicative. Les résultats sont calculés à partir des hypothèses renseignées et ne constituent ni une prévision comptable, ni un conseil fiscal ou juridique.';

export function buildAnalysis(results) {
  const { monthly: m, marginPct, breakEven: be, target: t } = results;
  const out = [];

  out.push({
    id: 'summary',
    text: `Avec vos hypothèses actuelles, votre activité générerait environ ${eur(m.revenue)} de chiffre d’affaires mensuel pour ${eur(m.totalCharges)} de charges estimées.`,
  });

  if (m.result > 0) {
    out.push({
      id: 'result', tone: 'positive',
      text: `Il resterait environ ${eur(m.result)} par mois avant rémunération, soit une marge d’environ ${pct(marginPct)}. Ce montant est calculé avant cotisations sociales et impôts, qui ne sont pas inclus.`,
    });
  } else if (m.result === 0) {
    out.push({ id: 'result', tone: 'warning', text: 'Avec ces hypothèses, l’activité serait à l’équilibre : ses recettes couvriraient exactement ses charges, sans rien laisser pour votre rémunération.' });
  } else {
    out.push({
      id: 'result', tone: 'negative',
      text: `Avec ces hypothèses, l’activité serait déficitaire d’environ ${eur(-m.result)} par mois : les charges dépasseraient le chiffre d’affaires.`,
    });
  }

  if (be.reachable) {
    const cover = be.coverage >= 1
      ? `Votre chiffre d’affaires estimé se situe au-dessus de ce seuil.`
      : `Votre chiffre d’affaires estimé se situe en dessous de ce seuil.`;
    out.push({
      id: 'breakeven',
      text: `Votre seuil de rentabilité se situerait autour de ${eur(be.revenue)} de chiffre d’affaires par mois, soit environ ${num1(be.days)} jours travaillés au rythme saisi. ${cover}`,
    });
  } else {
    out.push({ id: 'breakeven', tone: 'negative', text: 'Avec ces hypothèses, les charges liées à l’activité (carburant, entretien, péages) absorbent tout le chiffre d’affaires : aucun seuil de rentabilité ne peut être calculé. Revoyez vos prix ou vos coûts.' });
  }

  if (t.reachable) {
    if (t.achieved) {
      out.push({ id: 'target', tone: 'positive', text: `Pour un revenu souhaité de ${eur(t.income)} par mois, vos hypothèses actuelles suffiraient : il faudrait environ ${eur(t.revenueNeeded)} de chiffre d’affaires mensuel, et vous en estimez ${eur(m.revenue)}.` });
    } else {
      const feasibility = t.exceedsCalendar
        ? ' Cela dépasserait le nombre de jours d’un mois au rythme actuel : il faudrait augmenter le prix moyen, le nombre de courses ou réduire les charges.'
        : ` Au rythme actuel, cela représenterait environ ${num1(t.daysNeeded)} jours travaillés par mois.`;
      out.push({ id: 'target', tone: 'warning', text: `Pour dégager ${eur(t.income)} par mois, il faudrait environ ${eur(t.revenueNeeded)} de chiffre d’affaires mensuel, soit ${eur(t.gap)} de plus que votre estimation actuelle.${feasibility}` });
    }
  } else {
    out.push({ id: 'target', tone: 'negative', text: `Avec ces hypothèses, l’objectif de ${eur(t.income)} par mois ne peut pas être atteint en augmentant seulement le volume : chaque euro de chiffre d’affaires supplémentaire est absorbé par les charges variables.` });
  }

  // Poste de charge dominant
  const top = Object.entries(m.lines).sort((a, b) => b[1] - a[1])[0];
  if (top && m.totalCharges > 0) {
    out.push({ id: 'topcharge', text: `Le premier poste de charges serait « ${CHARGE_LABELS[top[0]].toLowerCase()} » avec environ ${eur(top[1])} par mois, soit ${pct((top[1] / m.totalCharges) * 100)} de vos charges.` });
  }

  for (const w of results.warnings) {
    if (w.code === 'many_days') out.push({ id: 'w_days', tone: 'warning', text: `Vous prévoyez ${w.value} jours travaillés par mois : vérifiez que ce rythme est tenable sur la durée (congés, entretien, jours sans activité).` });
    if (w.code === 'revenue_per_km_low') out.push({ id: 'w_kmlow', tone: 'warning', text: `Votre chiffre d’affaires ressort à environ ${num1(w.value)} € par km parcouru, ce qui est bas : vérifiez le prix moyen et la distance moyenne saisis.` });
    if (w.code === 'revenue_per_km_high') out.push({ id: 'w_kmhigh', tone: 'warning', text: `Votre chiffre d’affaires ressort à environ ${num1(w.value)} € par km parcouru, ce qui est élevé : vérifiez le prix moyen et la distance moyenne saisis.` });
    if (w.code === 'vehicle_mode_unknown') out.push({ id: 'w_mode', text: 'Le mode d’acquisition du véhicule n’est pas encore défini : le coût mensuel renseigné reste une hypothèse à confirmer.' });
    if (w.code === 'vehicle_cost_zero') out.push({ id: 'w_veh0', tone: 'warning', text: 'Le coût mensuel du véhicule est à 0 € : pensez à intégrer son amortissement ou son remplacement futur.' });
  }
  return out;
}
