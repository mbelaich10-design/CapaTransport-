import { ACTIVITIES, LEAD_STATUSES, TRANSPORT_TYPES, labelOf } from '../../shared/rules.js';

// Neutralise l'injection de formules Excel/Sheets (=, +, -, @, tab, retour chariot en tête de cellule).
function cell(value) {
  let s = value == null ? '' : String(value);
  // Exceptions : nombres (ex. -1500,00) et numéros de téléphone (+33 6 12…) sont inoffensifs.
  const harmless = /^-?\d+(,\d+)?$/.test(s) || /^\+[\d\s.()-]+$/.test(s);
  if (!harmless && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const dateFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'medium' });
const money = (n) => (n == null ? '' : n.toFixed(2).replace('.', ','));

const COLUMNS = [
  ['Date', (r) => dateFmt.format(new Date(r.createdAt))],
  ['Prénom', (r) => r.firstName],
  ['Nom', (r) => r.lastName],
  ['Email', (r) => r.email],
  ['Téléphone', (r) => r.phone],
  ['Activité', (r) => labelOf(ACTIVITIES, r.activity)],
  ['Type de transport', (r) => labelOf(TRANSPORT_TYPES, r.transportType)],
  ['CA mensuel estimé (€)', (r) => money(r.revenueMonthly)],
  ['Résultat mensuel estimé (€)', (r) => money(r.resultMonthly)],
  ['Source', (r) => r.source],
  ['Statut', (r) => labelOf(LEAD_STATUSES, r.status)],
  ['Consentement marketing', (r) => (r.marketingConsent ? 'Oui' : 'Non')],
];

/** CSV pour Excel FR : séparateur ";", BOM UTF-8, décimales à virgule. */
export function leadsToCsv(rows) {
  const lines = [COLUMNS.map(([h]) => cell(h)).join(';')];
  for (const r of rows) lines.push(COLUMNS.map(([, fn]) => cell(fn(r))).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}
