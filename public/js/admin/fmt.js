import { ACTIVITIES, LEAD_STATUSES, labelOf } from '/shared/rules.js';

export const dateTime = (iso) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
export const activityLabel = (v) => (v ? labelOf(ACTIVITIES, v) : '—');
// Libellé court pour le tableau ; le libellé complet est dans la fiche détail et l'export.
const SHORT = { light: 'Léger ≤ 3,5 t', heavy: 'Lourd > 3,5 t', unknown: 'À définir' };
export const transportLabel = (v) => SHORT[v] ?? '—';
export const statusLabel = (v) => labelOf(LEAD_STATUSES, v);
