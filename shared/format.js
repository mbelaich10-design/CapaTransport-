// Formatage fr-FR partagé (interface, analyse, exports).
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const eur = (n) => (n == null ? '—' : `${nf0.format(Math.round(n))} €`);
export const eur2 = (n) => (n == null ? '—' : `${nf2.format(n)} €`);
export const pct = (n) => (n == null ? '—' : `${nf1.format(n)} %`);
export const num = (n) => (n == null ? '—' : nf0.format(Math.round(n)));
export const num1 = (n) => (n == null ? '—' : nf1.format(n));
