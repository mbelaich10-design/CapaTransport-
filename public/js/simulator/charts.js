import { h } from '../dom.js';
import { CHARGE_LABELS } from '/shared/calc.js';
import { eur, pct } from '/shared/format.js';

export function tableView(caption, rows, headers = ['Poste', 'Montant']) {
  return h('details', { class: 'table-view' },
    h('summary', null, 'Voir les données en tableau'),
    h('table', { class: 'data' },
      h('caption', { class: 'sr-only' }, caption),
      h('thead', null, h('tr', null, headers.map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', null, rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r[0]), h('td', null, r[1]))))));
}

function hbar(label, valueText, fraction, cls, title) {
  return h('div', { class: 'hbar-row', title },
    h('div', { class: 'hbar-head' }, h('span', null, label), h('b', null, valueText)),
    h('div', { class: 'hbar-track', 'aria-hidden': 'true' }, h('div', { class: `hbar-fill ${cls}`, style: { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` } })));
}

/** Chiffre d'affaires, charges et résultat, côte à côte (mêmes unités, un seul axe). */
export function compareChart(m) {
  const max = Math.max(m.revenue, m.totalCharges, Math.abs(m.result), 1);
  return h('div', null,
    h('h3', { class: 'chart-title' }, 'Chiffre d’affaires, charges et résultat'),
    h('p', { class: 'chart-sub' }, 'Montants mensuels estimés'),
    hbar('Chiffre d’affaires', eur(m.revenue), m.revenue / max, 'rev'),
    hbar('Charges', eur(m.totalCharges), m.totalCharges / max, 'chg'),
    hbar(m.result < 0 ? 'Résultat (déficit)' : 'Résultat avant rémunération', eur(m.result), Math.abs(m.result) / max, m.result < 0 ? 'neg' : 'res'),
    tableView('Chiffre d’affaires, charges et résultat mensuels', [['Chiffre d’affaires', eur(m.revenue)], ['Charges', eur(m.totalCharges)], ['Résultat avant rémunération', eur(m.result)]]));
}

/** Répartition des charges : une seule teinte, triée, avec valeur et part. */
export function chargesChart(m) {
  const items = Object.entries(m.lines).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const max = items[0]?.[1] || 1;
  return h('div', null,
    h('h3', { class: 'chart-title' }, 'Où partent vos charges'),
    h('p', { class: 'chart-sub' }, `Répartition des ${eur(m.totalCharges)} de charges mensuelles`),
    items.length
      ? items.map(([k, v]) => hbar(CHARGE_LABELS[k], `${eur(v)} · ${pct((v / m.totalCharges) * 100)}`, v / max, 'one', `${CHARGE_LABELS[k]} : ${eur(v)}`))
      : h('p', { class: 'muted' }, 'Aucune charge renseignée.'),
    tableView('Détail des charges mensuelles', items.map(([k, v]) => [CHARGE_LABELS[k], `${eur(v)} (${pct((v / m.totalCharges) * 100)})`]), ['Poste', 'Montant (part)']));
}

/** Où se situe votre CA par rapport au seuil de rentabilité et à l'objectif. */
export function positionChart(results) {
  const { monthly: m, breakEven: be, target: t } = results;
  const points = [];
  if (be.reachable) points.push({ n: 1, cls: 'be', label: 'Seuil de rentabilité', v: be.revenue });
  points.push({ n: points.length + 1, cls: 'you', label: 'Votre CA estimé', v: m.revenue });
  if (t.reachable) points.push({ n: points.length + 1, cls: 'goal', label: `CA pour ${eur(t.income)} de revenu`, v: t.revenueNeeded });
  const max = Math.max(...points.map((p) => p.v), 1) * 1.12;
  const placed = [...points].sort((a, b) => a.v - b.v);
  let lastPos = -100; let lift = false;
  for (const p of placed) {
    p.pos = Math.max(4, Math.min(96, (p.v / max) * 100));
    lift = p.pos - lastPos < 9 ? !lift : false; // repères trop proches : on décale verticalement
    p.lift = lift; lastPos = p.pos;
  }
  return h('div', null,
    h('h3', { class: 'chart-title' }, 'Où vous situez-vous ?'),
    h('p', { class: 'chart-sub' }, 'Chiffre d’affaires mensuel, de 0 € vers la droite'),
    h('div', { class: 'scale', role: 'img', 'aria-label': points.map((p) => `${p.label} : ${eur(p.v)}`).join(' ; ') },
      h('div', { class: 'scale-line' }),
      points.map((p) => h('span', { class: `scale-mark ${p.cls}`, style: { left: `${p.pos}%`, ...(p.lift ? { top: '-6px' } : {}) } }, String(p.n)))),
    h('ul', { class: 'scale-list' }, points.map((p) => h('li', null,
      h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px' } }, h('span', { class: 'dot', style: { background: `var(--${p.cls === 'you' ? 's1' : p.cls === 'be' ? 's2' : 's3'})` } }, String(p.n)), p.label),
      h('b', null, eur(p.v))))));
}
