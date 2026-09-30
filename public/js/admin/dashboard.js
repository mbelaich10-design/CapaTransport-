import { h } from '../dom.js';
import { api } from '../api.js';
import { eur, num, pct } from '/shared/format.js';
import { activityLabel, dateTime, statusLabel } from './fmt.js';

const stat = (label, value, sub) => h('div', { class: 'kpi' }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), sub ? h('div', { class: 'kpi-sub' }, sub) : null);

function sparkline(daily) {
  // 14 derniers jours, y compris les jours sans simulation.
  const byDay = Object.fromEntries(daily.map((d) => [d.day, d.n]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    return { key, n: byDay[key] ?? 0, label: d.toLocaleDateString('fr-FR', { day: '2-digit' }) };
  });
  const max = Math.max(...days.map((d) => d.n), 1);
  return h('div', { class: 'spark', role: 'img', 'aria-label': `Simulations par jour sur 14 jours : ${days.map((d) => `${d.key} ${d.n}`).join(', ')}` },
    days.map((d) => h('div', { class: 'spark-col', title: `${d.key} : ${d.n} simulation(s)` },
      h('b', null, d.n || ''), h('div', { class: 'spark-bar', style: { height: `${(d.n / max) * 70}%`, opacity: d.n ? 1 : 0.25 } }), h('small', null, d.label))));
}

export async function renderDashboard(el) {
  const { stats: s, recentLeads } = await api('GET', '/api/admin/dashboard');
  el.replaceChildren(
    h('h1', null, 'Tableau de bord'),
    h('div', { class: 'a-grid' },
      stat('Simulations', num(s.totalSimulations)),
      stat('Prospects', num(s.totalLeads)),
      stat('Taux de conversion', pct(s.conversionRate * 100), 'Simulations avec coordonnées'),
      stat('Dernières 24 h', num(s.simulations24h), 'simulations'),
      stat('7 derniers jours', num(s.simulations7d), 'simulations'),
      stat('CA moyen simulé', s.avgRevenue == null ? '—' : eur(s.avgRevenue), 'par mois'),
      stat('Résultat moyen simulé', s.avgResult == null ? '—' : eur(s.avgResult), 'par mois, avant rémunération')),
    h('div', { class: 'a-cols' },
      h('section', { class: 'a-card' }, h('h2', null, 'Simulations des 14 derniers jours'), sparkline(s.daily)),
      h('section', { class: 'a-card' }, h('h2', null, 'Prospects récents'),
        recentLeads.length === 0 ? h('p', { class: 'empty' }, 'Aucun prospect pour le moment.') :
          h('div', { class: 'table-wrap' }, h('table', { class: 'grid', style: { minWidth: '0' } },
            h('thead', null, h('tr', null, ['Date', 'Prospect', 'Activité', 'Statut'].map((t) => h('th', null, t)))),
            h('tbody', null, recentLeads.map((l) => h('tr', null,
              h('td', null, dateTime(l.createdAt)), h('td', null, `${l.firstName} ${l.lastName}`), h('td', null, activityLabel(l.activity)),
              h('td', null, h('span', { class: `badge ${l.status}` }, statusLabel(l.status)))))))),
        h('p', { style: { marginTop: '12px', marginBottom: 0 } }, h('a', { href: '/admin/prospects', 'data-link': true }, 'Voir tous les prospects →')))));
}
