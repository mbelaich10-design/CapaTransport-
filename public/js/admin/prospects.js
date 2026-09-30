import { h, icon, toast } from '../dom.js';
import { api } from '../api.js';
import { ACTIVITIES, LEAD_STATUSES, LEGAL_STATUSES, TRANSPORT_TYPES, VEHICLE_MODES, labelOf } from '/shared/rules.js';
import { CHARGE_LABELS } from '/shared/calc.js';
import { eur, num1, pct } from '/shared/format.js';
import { activityLabel, dateTime, statusLabel, transportLabel } from './fmt.js';

const FILTER_KEYS = ['q', 'status', 'activity', 'transportType', 'source', 'consent', 'from', 'to'];
const COLUMNS = [
  ['date', 'Date'], [null, 'Prénom'], ['name', 'Nom'], [null, 'Email'], [null, 'Téléphone'], [null, 'Activité'], [null, 'Type de transport'],
  ['revenue', 'CA estimé'], ['result', 'Résultat estimé'], [null, 'Source'], ['status', 'Statut'],
];

const selectOf = (opts, value, onChange, placeholder) => h('select', { class: 'a-select', onChange: (e) => onChange(e.target.value) },
  h('option', { value: '' }, placeholder), opts.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));

export async function renderProspects(el) {
  const params = new URLSearchParams(location.search);
  const state = { page: Number(params.get('page')) || 1, sort: params.get('sort') || 'date', dir: params.get('dir') || 'desc' };
  for (const k of FILTER_KEYS) state[k] = params.get(k) || '';

  const query = (extra = {}) => {
    const p = new URLSearchParams();
    for (const k of FILTER_KEYS) if (state[k]) p.set(k, state[k]);
    p.set('sort', state.sort); p.set('dir', state.dir);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  };

  const tableBox = h('div', null);
  const exportLink = h('a', { class: 'btn btn-ghost btn-sm', href: '#' }, icon('file', 16), 'Exporter en CSV');
  const sourceSel = h('select', { class: 'a-select' });
  let timer;

  const reload = (resetPage = true) => {
    if (resetPage) state.page = 1;
    history.replaceState(null, '', `/admin/prospects?${query({ page: state.page })}`);
    load();
  };

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Nom, email ou téléphone…', value: state.q, 'aria-label': 'Rechercher un prospect',
    onInput: (e) => { clearTimeout(timer); timer = setTimeout(() => { state.q = e.target.value.trim(); reload(); }, 300); } });

  const filter = (label, control) => h('div', null, h('label', null, label), control);
  const toolbar = h('div', { class: 'toolbar' },
    h('div', { class: 'search' }, h('label', null, 'Recherche'), search),
    filter('Statut', selectOf(LEAD_STATUSES, state.status, (v) => { state.status = v; reload(); }, 'Tous')),
    filter('Activité', selectOf(ACTIVITIES, state.activity, (v) => { state.activity = v; reload(); }, 'Toutes')),
    filter('Type de transport', selectOf(TRANSPORT_TYPES, state.transportType, (v) => { state.transportType = v; reload(); }, 'Tous')),
    filter('Source', sourceSel),
    filter('Consentement marketing', selectOf([{ value: '1', label: 'Oui' }, { value: '0', label: 'Non' }], state.consent, (v) => { state.consent = v; reload(); }, 'Tous')),
    filter('Du', h('input', { class: 'input', type: 'date', value: state.from, onChange: (e) => { state.from = e.target.value; reload(); } })),
    filter('Au', h('input', { class: 'input', type: 'date', value: state.to, onChange: (e) => { state.to = e.target.value; reload(); } })),
    h('div', { class: 'toolbar-actions' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => { history.replaceState(null, '', '/admin/prospects'); renderProspects(el); } }, 'Réinitialiser'),
      exportLink));

  el.replaceChildren(h('h1', null, 'Prospects'), toolbar, tableBox);

  let seq = 0;
  async function load() {
    const mine = ++seq; // ignore les réponses périmées si l'utilisateur a relancé une recherche entre-temps
    const data = await api('GET', `/api/admin/leads?${query({ page: state.page })}`);
    if (mine !== seq) return;
    exportLink.href = `/api/admin/leads/export.csv?${query()}`;
    exportLink.setAttribute('download', '');
    sourceSel.replaceChildren(h('option', { value: '' }, 'Toutes'), ...data.sources.map((s) => h('option', { value: s, selected: s === state.source }, s)));
    sourceSel.onchange = (e) => { state.source = e.target.value; reload(); };
    tableBox.replaceChildren(renderTable(data));
  }

  function sortHeader([key, label]) {
    if (!key) return h('th', null, label);
    const active = state.sort === key;
    return h('th', { 'aria-sort': active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', onClick: () => { state.dir = active && state.dir === 'desc' ? 'asc' : 'desc'; state.sort = key; reload(false); } }, label, active ? (state.dir === 'asc' ? ' ▲' : ' ▼') : ''));
  }

  function renderTable(data) {
    if (!data.leads.length) return h('div', { class: 'a-card empty' }, 'Aucun prospect ne correspond à ces critères.');
    const money = (v) => h('td', { class: `num ${v < 0 ? 'neg' : ''}` }, v == null ? '—' : eur(v));
    return h('div', null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
        h('thead', null, h('tr', null, COLUMNS.map(sortHeader))),
        h('tbody', null, data.leads.map((l) => h('tr', null,
          h('td', null, dateTime(l.createdAt)),
          h('td', null, h('button', { class: 'link-row', type: 'button', onClick: () => openDetail(l.id) }, l.firstName)),
          h('td', null, l.lastName),
          h('td', { class: 'clip', title: l.email }, h('a', { href: `mailto:${l.email}` }, l.email)),
          h('td', { style: { whiteSpace: 'nowrap' } }, l.phone ?? '—'),
          h('td', null, activityLabel(l.activity)),
          h('td', null, transportLabel(l.transportType)),
          money(l.revenueMonthly), money(l.resultMonthly),
          h('td', { class: 'clip sm', title: l.source ?? '' }, l.source ?? '—'),
          h('td', null, statusSelect(l)))))
      )),
      h('div', { class: 'pager' },
        h('span', null, `${data.total} prospect${data.total > 1 ? 's' : ''} · page ${data.page} sur ${data.pages}`),
        h('span', { style: { display: 'flex', gap: '8px' } },
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: data.page <= 1, onClick: () => { state.page -= 1; reload(false); } }, '← Précédent'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', disabled: data.page >= data.pages, onClick: () => { state.page += 1; reload(false); } }, 'Suivant →'))));
  }

  function statusSelect(l, onDone) {
    const sel = h('select', { class: `a-select badge ${l.status}`, 'aria-label': `Statut de ${l.firstName} ${l.lastName}`, style: { minHeight: '34px', width: 'auto' },
      onChange: async (e) => {
        const previous = l.status;
        try { await api('PATCH', `/api/admin/leads/${l.id}`, { status: e.target.value }); l.status = e.target.value; sel.className = `a-select badge ${l.status}`; toast('Statut mis à jour.'); onDone?.(); }
        catch (err) { e.target.value = previous; toast(err.message, 'err'); }
      } }, LEAD_STATUSES.map((s) => h('option', { value: s.value, selected: s.value === l.status }, s.label)));
    return sel;
  }

  async function openDetail(id) {
    const { lead: l, simulation: s } = await api('GET', `/api/admin/leads/${id}`);
    const row = (k, v) => h('div', null, h('dt', null, k), h('dd', null, v ?? '—'));
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' },
      h('div', { class: 'dlg-head' }, h('div', null, h('h2', { id: 'dlg-title', style: { marginBottom: '2px' } }, `${l.firstName} ${l.lastName}`), h('span', { class: 'muted' }, `Inscrit le ${dateTime(l.createdAt)}`)),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'aria-label': 'Fermer', onClick: () => dlg.close() }, icon('x', 16))),
      h('div', { class: 'dlg-body' },
        h('dl', { class: 'dl' }, row('Email', h('a', { href: `mailto:${l.email}` }, l.email)), row('Téléphone', l.phone), row('Source', [l.source, l.utmMedium, l.utmCampaign].filter(Boolean).join(' / ')),
          row('Consentement marketing', l.marketingConsent ? 'Oui' : 'Non'), row('Simulations', String(l.simulationsCount)), row('Statut', statusSelect(l, load))),
        s ? simulationBlock(s) : h('p', { class: 'muted' }, 'Aucune simulation rattachée.')));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }

  function simulationBlock(s) {
    const { input: i, results: r } = s; const m = r.monthly;
    const row = (k, v) => h('div', null, h('dt', null, k), h('dd', null, v ?? '—'));
    return h('div', null,
      h('h3', null, `Dernière simulation (${dateTime(s.createdAt)})`),
      h('h4', { class: 'muted' }, 'Hypothèses saisies'),
      h('dl', { class: 'dl' },
        row('Transport', labelOf(TRANSPORT_TYPES, i.project.transportType)), row('Activité', labelOf(ACTIVITIES, i.project.activity)), row('Statut', labelOf(LEGAL_STATUSES, i.project.legalStatus)),
        row('Véhicule possédé', i.vehicle.owned ? 'Oui' : 'Non'), row('Mode', labelOf(VEHICLE_MODES, i.vehicle.mode)), row('Coût véhicule', eur(i.vehicle.monthlyCost)),
        row('Consommation', `${i.vehicle.consumption} L/100 km`), row('Carburant', `${i.vehicle.fuelPrice} €/L`),
        row('Jours / mois', i.work.daysPerMonth), row('Courses / jour', i.work.tripsPerDay), row('Prix moyen', eur(i.work.avgPrice)), row('Distance moyenne', `${i.work.avgDistance} km`),
        row('Objectif de revenu', eur(i.target.income))),
      h('h4', { class: 'muted' }, 'Résultats calculés (mensuels)'),
      h('dl', { class: 'dl' },
        row('Chiffre d’affaires', eur(m.revenue)), row('Charges', eur(m.totalCharges)), row('Résultat avant rémunération', eur(m.result)), row('Marge', pct(r.marginPct)),
        row('Seuil de rentabilité', r.breakEven.reachable ? `${eur(r.breakEven.revenue)} (${num1(r.breakEven.days)} j)` : 'Non atteignable'),
        row('CA pour l’objectif', r.target.reachable ? eur(r.target.revenueNeeded) : 'Non atteignable'),
        Object.entries(m.lines).map(([k, v]) => row(CHARGE_LABELS[k], eur(v)))));
  }

  await load();
}
