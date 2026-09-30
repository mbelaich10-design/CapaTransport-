// Point d'entrée du simulateur public : routage (History API), étapes, soumission, résultats.
import { clear, h, icon, store, toast } from '../dom.js';
import { api, ApiError } from '../api.js';
import { STEP_VALIDATORS } from '/shared/validate.js';
import { STEP_BUILDERS } from './steps.js';
import { renderResults } from './results.js';
import {
  SECTIONS, STEP_TITLES, LAST_SIM_KEY, applyDefaults, captureTracking, clearDraft, emptyDraft, getTracking, isHeavy, loadDraft, saveDraft,
} from './state.js';

const $landing = document.getElementById('view-landing');
const $app = document.getElementById('view-app');
let settings = null; // chargé depuis /api/config (source unique des valeurs par défaut)
let draft = loadDraft();
let renderToken = 0;
let settingsPromise = null;
function ensureSettings() {
  settingsPromise ??= api('GET', '/api/config').then((c) => { settings = c.settings; }).catch((e) => { settingsPromise = null; throw e; });
  return settingsPromise;
}

// ---------- Routage ----------
export function navigate(path, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  route();
}

document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', route);

function show(view) {
  $landing.hidden = view !== 'landing';
  $app.hidden = view !== 'app';
  document.getElementById('header-cta').hidden = view === 'app';
}

function focusTitle(id) {
  const el = document.getElementById(id);
  if (el) el.focus({ preventScroll: true });
}

async function route() {
  const token = ++renderToken;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const stepMatch = path.match(/^\/simulation\/([1-5])$/);
  const resultMatch = path.match(/^\/resultats\/([A-Za-z0-9_-]{10,40})$/);
  if (stepMatch || resultMatch) {
    show('app'); window.scrollTo(0, 0);
    try { await ensureSettings(); } catch (err) { if (token === renderToken) renderUnavailable(err); return; }
    if (token !== renderToken) return;
    return stepMatch ? renderStep(Number(stepMatch[1]) - 1) : renderResultsPage(resultMatch[1], token);
  }
  show('landing');
  document.title = 'CapaTransport — Simulateur de projet transport';
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  else window.scrollTo(0, 0);
}

// ---------- Étapes ----------
function firstInvalidStep(upTo) {
  for (let i = 0; i < upTo; i += 1) {
    if (Object.keys(STEP_VALIDATORS[SECTIONS[i]](draft[SECTIONS[i]]).errors).length) return i;
  }
  return -1;
}

function renderStep(index) {
  const blocked = firstInvalidStep(index);
  if (blocked !== -1) return navigate(`/simulation/${blocked + 1}`, { replace: true });

  applyDefaults(draft, settings);
  saveDraft(draft);
  const ctx = { draft, settings, heavy: isHeavy(draft), save: () => saveDraft(draft), onChange: undefined };
  const step = STEP_BUILDERS[index](ctx);
  const last = index === STEP_BUILDERS.length - 1;
  document.title = `${STEP_TITLES[index]} (étape ${index + 1}/5) — CapaTransport`;

  const next = h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, last ? 'Voir mes résultats' : 'Continuer', icon('arrow', 20));
  const errorBanner = h('div', { class: 'banner err', role: 'alert', hidden: true });

  const showErrors = (errors) => {
    for (const [path, f] of Object.entries(step.fields)) f.setError(errors[path] ?? '');
    const first = Object.keys(errors)[0];
    if (first) {
      const f = step.fields[first];
      (f?.el.querySelector('input:checked, input.input') || f?.el.querySelector('input'))?.focus();
      f?.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    const section = SECTIONS[index];
    const { errors } = STEP_VALIDATORS[section](draft[section]);
    showErrors(errors);
    if (Object.keys(errors).length) return;
    if (!last) return navigate(`/simulation/${index + 2}`);
    await submitSimulation({ next, errorBanner });
  } },
    step.el, errorBanner,
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Étape précédente', onClick: () => (index === 0 ? navigate('/') : history.back()) }, icon('back', 18), index === 0 ? 'Accueil' : 'Retour'),
      next));

  const dots = h('div', { class: 'progress-dots', 'aria-hidden': 'true' }, STEP_TITLES.map((t, i) => h('span', { class: i === index ? 'on' : '' }, `${i + 1}. ${t}`)));
  const bar = h('div', { class: 'progress-fill', style: { width: `${((index + 1) / 5) * 100}%` } });
  clear($app).append(h('div', { class: 'container narrow sim' },
    h('div', { class: 'progress' },
      h('div', { class: 'progress-top' }, h('strong', null, STEP_TITLES[index]), h('span', null, `Étape ${index + 1} sur 5`)),
      h('div', { class: 'progress-track', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': '5', 'aria-valuenow': String(index + 1), 'aria-label': 'Progression de la simulation' }, bar), dots),
    h('div', { class: 'step-panel' }, form)));
  focusTitle('step-title');
}

async function submitSimulation({ next, errorBanner }) {
  errorBanner.hidden = true;
  next.disabled = true; next.replaceChildren(h('span', { class: 'spinner' }), 'Calcul en cours…');
  try {
    const input = Object.fromEntries(SECTIONS.map((s) => [s, draft[s]]));
    const sim = await api('POST', '/api/simulations', { input, tracking: getTracking() });
    store.set(LAST_SIM_KEY, sim.id);
    navigate(`/resultats/${sim.id}`);
  } catch (err) {
    next.disabled = false; next.replaceChildren('Voir mes résultats', icon('arrow', 20));
    if (err instanceof ApiError && err.fields) {
      // Le serveur est la source de vérité : on renvoie l'utilisateur à la première étape concernée.
      const bad = SECTIONS.findIndex((s) => Object.keys(err.fields).some((k) => k.startsWith(`${s}.`)));
      if (bad !== -1) { toast('Certaines valeurs sont à corriger.', 'err'); return navigate(`/simulation/${bad + 1}`); }
    }
    errorBanner.hidden = false; errorBanner.replaceChildren(icon('alert', 20), h('span', null, err.message));
  }
}

// ---------- Résultats ----------
async function renderResultsPage(id, token, extra = {}) {
  document.title = 'Vos résultats — CapaTransport';
  clear($app).append(h('div', { class: 'loading' }, h('span', { class: 'spinner dark' }), 'Chargement de votre simulation…'));
  let sim;
  try { sim = await api('GET', `/api/simulations/${id}`); } catch (err) {
    if (token !== renderToken) return;
    clear($app).append(h('div', { class: 'container narrow page-simple' },
      h('h1', null, err.status === 404 ? 'Simulation introuvable' : 'Une erreur est survenue'),
      h('p', null, err.status === 404 ? 'Ce lien ne correspond à aucune simulation.' : err.message),
      h('a', { class: 'btn btn-primary', href: '/simulation/1', 'data-link': true }, 'Lancer une simulation')));
    return;
  }
  if (token !== renderToken) return;
  const view = renderResults({
    sim, settings, ...extra,
    onUnlocked: (_updated, email) => renderResultsPage(id, ++renderToken, { justUnlocked: true, unlockedEmail: email }),
    onEdit: () => {
      // Rechargement des saisies de cette simulation dans le brouillon pour les modifier.
      draft = { ...emptyDraft(), ...Object.fromEntries(SECTIONS.map((s) => [s, stringify(sim.input[s])])), touched: touchedAll(sim.input) };
      saveDraft(draft); navigate('/simulation/1');
    },
    onNew: () => { draft = emptyDraft(); clearDraft(); store.del(LAST_SIM_KEY); navigate('/simulation/1'); },
  });
  clear($app).append(view);
  if (extra.justUnlocked) view.scrollIntoView(); else window.scrollTo(0, 0);
  focusTitle('results-title');
}

const stringify = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v).replace('.', ',')]));
const touchedAll = (input) => Object.fromEntries(SECTIONS.flatMap((s) => Object.keys(input[s]).map((k) => [`${s}.${k}`, true])));

// ---------- Démarrage ----------
function renderUnavailable(err) {
  clear($app).append(h('div', { class: 'container narrow page-simple' },
    h('h1', null, 'Simulateur momentanément indisponible'), h('p', null, err.message),
    h('button', { class: 'btn btn-primary', type: 'button', onClick: () => route() }, 'Réessayer')));
}

captureTracking();
for (const el of document.querySelectorAll('.mock-bar')) { el.style.width = `${el.dataset.w}%`; el.style.background = el.dataset.c; }
ensureSettings().catch(() => {}); // préchargement ; les vues du simulateur attendent le résultat
route();
