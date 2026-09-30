import { h, icon } from '../dom.js';
import { api, ApiError } from '../api.js';
import { ACTIVITIES, LEGAL_STATUSES, TRANSPORT_TYPES, labelOf } from '/shared/rules.js';
import { DISCLAIMER } from '/shared/analysis.js';
import { validateLead } from '/shared/validate.js';
import { eur, num1, pct } from '/shared/format.js';
import { textField } from './fields.js';
import { chargesChart, compareChart, positionChart } from './charts.js';

const kpi = (label, value, { sub, cls = '', mark } = {}) =>
  h('div', { class: `kpi ${cls}` },
    h('div', { class: 'kpi-label' }, mark ? h('i', { class: 'kpi-mark', style: { background: mark } }) : null, label),
    h('div', { class: 'kpi-value' }, value),
    sub ? h('div', { class: 'kpi-sub' }, sub) : null);

function offerUrl(settings) {
  try { const u = new URL(settings.offerUrl); u.searchParams.set('utm_source', 'simulateur'); u.searchParams.set('utm_medium', 'resultats'); return u.toString(); } catch { return settings.offerUrl; }
}

function targetExplanation(results) {
  const { monthly: m, target: t } = results;
  const share = m.revenue > 0 ? 1 - m.variableCharges / m.revenue : 0;
  const box = h('section', { class: 'panel block' }, h('h2', null, 'Le chiffre d’affaires pour atteindre votre objectif'));
  if (!t.reachable) {
    box.append(h('div', { class: 'verdict bad' }, `Avec ces hypothèses, le carburant, l’entretien et les péages absorbent l’intégralité de votre chiffre d’affaires : augmenter le volume ne suffirait pas à dégager ${eur(t.income)} par mois. Revoyez vos prix, vos distances ou vos coûts.`));
    return box;
  }
  box.append(
    h('p', { class: 'muted' }, `Objectif : ${eur(t.income)} par mois, avant cotisations sociales et impôts.`),
    h('ol', { class: 'explain', style: { padding: '0', margin: '0' } },
      h('li', null, h('span', { class: 'n' }, '1'), h('div', null, h('b', null, `Vos charges fixes : ${eur(m.fixedCharges)} par mois.`), h('div', { class: 'muted' }, 'Véhicule, assurance, téléphone, logiciel, comptabilité, autres : elles courent même les jours sans course.'))),
      h('li', null, h('span', { class: 'n' }, '2'), h('div', null, h('b', null, `Sur 100 € facturés, il vous en reste ${num1(share * 100)} € après carburant, entretien et péages.`), h('div', { class: 'muted' }, 'C’est la part de chaque euro de chiffre d’affaires qui sert à payer vos charges fixes puis votre revenu.'))),
      h('li', null, h('span', { class: 'n' }, '3'), h('div', null, h('b', null, 'Il faut donc couvrir vos charges fixes et votre objectif.'), h('div', { class: 'muted' }, 'Le chiffre d’affaires nécessaire s’obtient en divisant leur somme par cette part.')))),
    h('div', { class: 'formula' }, `(${eur(m.fixedCharges)} + ${eur(t.income)}) ÷ ${num1(share * 100)} % = `, h('b', null, `${eur(t.revenueNeeded)} de chiffre d’affaires par mois`)));
  if (t.achieved) box.append(h('div', { class: 'verdict ok' }, `Objectif atteint avec vos hypothèses : vous estimez ${eur(m.revenue)}, soit ${eur(-t.gap)} de marge par rapport au chiffre d’affaires nécessaire.`));
  else box.append(h('div', { class: 'verdict gap' }, `Il manquerait ${eur(t.gap)} de chiffre d’affaires par mois par rapport à votre estimation (${eur(m.revenue)}).${t.exceedsCalendar ? ' Au rythme saisi, cela dépasserait le nombre de jours d’un mois.' : ` Au rythme actuel, cela représente environ ${num1(t.daysNeeded)} jours travaillés par mois.`}`));
  return box;
}

function leadForm({ sim, onUnlocked }) {
  const f = {
    firstName: textField({ name: 'firstName', label: 'Prénom', autocomplete: 'given-name' }),
    lastName: textField({ name: 'lastName', label: 'Nom', autocomplete: 'family-name' }),
    email: textField({ name: 'email', label: 'Email', type: 'email', autocomplete: 'email', inputmode: 'email' }),
    phone: textField({ name: 'phone', label: 'Téléphone', type: 'tel', autocomplete: 'tel', inputmode: 'tel', required: false }),
  };
  const consent = h('input', { type: 'checkbox', id: 'marketing-consent' });
  const trap = h('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
  const errorBanner = h('div', { class: 'banner err', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Recevoir mon rapport gratuitement');

  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault();
    errorBanner.hidden = true;
    const payload = { firstName: f.firstName.input.value, lastName: f.lastName.input.value, email: f.email.input.value, phone: f.phone.input.value, marketingConsent: consent.checked };
    const v = validateLead(payload);
    for (const [k, fld] of Object.entries(f)) fld.setError(v.errors[k] ?? '');
    if (!v.ok) { f[Object.keys(v.errors)[0]].input.focus(); return; }
    submit.disabled = true; submit.replaceChildren(h('span', { class: 'spinner' }), 'Enregistrement…');
    try {
      const updated = await api('POST', `/api/simulations/${sim.id}/lead`, { lead: payload, website: trap.value });
      onUnlocked(updated, v.value.email);
    } catch (err) {
      submit.disabled = false; submit.textContent = 'Recevoir mon rapport gratuitement';
      if (err instanceof ApiError && err.fields) {
        for (const [k, msg] of Object.entries(err.fields)) f[k]?.setError(msg);
      } else {
        errorBanner.hidden = false; errorBanner.replaceChildren(icon('alert', 20), h('span', null, err.message));
      }
    }
  } },
    h('div', { class: 'form-grid two' }, f.firstName.el, f.lastName.el),
    f.email.el, f.phone.el,
    h('div', { class: 'trap', 'aria-hidden': 'true' }, h('label', null, 'Ne pas remplir ce champ', trap)),
    h('label', { class: 'consent', for: 'marketing-consent' }, consent,
      h('span', null, 'Je souhaite recevoir des informations et offres de CapaTransport Formation par email et téléphone. ', h('span', { class: 'muted' }, '(facultatif — vous pouvez vous désinscrire à tout moment)'))),
    errorBanner, submit,
    h('p', { class: 'fine', style: { marginTop: '12px' } }, 'Vos coordonnées servent à vous fournir votre rapport. Elles ne sont jamais vendues. ', h('a', { href: '/confidentialite', target: '_blank', rel: 'noopener' }, 'En savoir plus')));

  return h('section', { class: 'gate', id: 'rapport' },
    h('div', { class: 'teaser', 'aria-hidden': 'true' }, h('div', { class: 'sk' }), h('div', { class: 'sk tall' }), h('div', { class: 'sk' })),
    h('div', { class: 'gate-card' },
      h('h2', null, 'Recevez votre rapport gratuitement'),
      h('p', { class: 'muted' }, 'Débloquez immédiatement l’analyse complète de votre projet :'),
      h('ul', { class: 'lock-list' }, ['Marge estimée et seuil de rentabilité', 'Chiffre d’affaires nécessaire pour votre objectif de revenu', 'Graphiques et répartition détaillée des charges', 'Analyse automatique de vos hypothèses'].map((t) => h('li', null, icon('check', 18), t))),
      form));
}

/** Rend la page de résultats. `sim` provient de l'API (aperçu tant que non débloqué). */
export function renderResults({ sim, settings, justUnlocked, unlockedEmail, onUnlocked, onEdit, onNew }) {
  const r = sim.results; const m = r.monthly; const input = sim.input;
  const negative = m.result < 0;
  const root = h('div', { class: 'container results' });

  root.append(h('div', { class: 'results-head' },
    h('h1', { tabindex: '-1', id: 'results-title' }, 'Votre projet en quelques chiffres'),
    h('p', { class: 'muted' }, [labelOf(TRANSPORT_TYPES, input.project.transportType), labelOf(ACTIVITIES, input.project.activity), labelOf(LEGAL_STATUSES, input.project.legalStatus)].join(' · '))));

  if (justUnlocked) {
    root.append(h('div', { class: 'banner ok', role: 'status' }, icon('check', 22), h('div', null,
      h('b', null, 'Votre rapport complet est débloqué.'), h('div', null, sim.reportStatus === 'sent' ? `Il a été envoyé à ${unlockedEmail}.` : 'Votre demande d’envoi par email est enregistrée. Vous pouvez aussi l’enregistrer en PDF avec le bouton en bas de page.'))));
  }

  root.append(h('div', { class: 'disclaimer-box', role: 'note' }, icon('info', 20), h('span', null, DISCLAIMER)));

  const kpis = [
    kpi('CA mensuel estimé', eur(m.revenue), { mark: 'var(--s1)' }),
    kpi('CA annuel estimé', eur(r.annual.revenue), { mark: 'var(--s1)' }),
    kpi('Charges mensuelles estimées', eur(m.totalCharges), { mark: 'var(--s2)' }),
    kpi('Charges annuelles estimées', eur(r.annual.totalCharges), { mark: 'var(--s2)' }),
    kpi(negative ? 'Résultat avant rémunération (déficit)' : 'Résultat avant rémunération', eur(m.result), { cls: `wide ${negative ? 'result-neg' : 'result-pos'}`, sub: `Par mois, avant cotisations sociales et impôts · ${eur(r.annual.result)} par an` }),
  ];
  if (sim.unlocked) {
    kpis.push(
      kpi('Marge estimée', pct(r.marginPct), { cls: 'third', sub: 'Résultat ÷ chiffre d’affaires' }),
      kpi('Seuil de rentabilité', r.breakEven.reachable ? eur(r.breakEven.revenue) : 'Non atteignable', { cls: 'third', sub: r.breakEven.reachable ? `CA mensuel, soit environ ${num1(r.breakEven.days)} jours travaillés` : 'Les coûts variables dépassent le CA' }),
      kpi(`CA pour ${eur(r.target.income)} de revenu`, r.target.reachable ? eur(r.target.revenueNeeded) : 'Non atteignable', { cls: 'third', sub: 'CA mensuel nécessaire (voir ci-dessous)' }));
  }
  root.append(h('div', { class: 'kpis' }, kpis));

  if (!sim.unlocked) {
    root.append(leadForm({ sim, onUnlocked }));
  } else {
    root.append(
      h('section', { class: 'panel block' }, h('h2', null, 'Ce que disent vos chiffres'),
        h('ul', { class: 'analysis' }, sim.analysis.map((a) => h('li', { class: a.tone ?? '' }, a.text)))),
      h('section', { class: 'panel block' }, compareChart(m)),
      h('section', { class: 'panel block' }, chargesChart(m)),
      h('section', { class: 'panel block' }, positionChart(r)),
      targetExplanation(r),
      h('section', { class: 'offer' },
        h('h2', null, 'Vous souhaitez être accompagné dans votre projet ?'),
        h('p', null, 'CapaTransport Formation propose des formations et un accompagnement aux personnes qui souhaitent créer leur activité de transport routier. Découvrez comment nous pouvons vous aider à préparer votre projet.'),
        h('a', { class: 'btn btn-amber btn-lg', href: offerUrl(settings), target: '_blank', rel: 'noopener' }, settings.offerCtaLabel, icon('arrow', 20))));
  }

  root.append(h('div', { class: 'results-actions no-print' },
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: onEdit }, icon('back', 18), 'Modifier mes hypothèses'),
    sim.unlocked ? h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => window.print() }, icon('file', 18), 'Imprimer / enregistrer en PDF') : null,
    h('button', { class: 'btn btn-ghost', type: 'button', onClick: onNew }, 'Nouvelle simulation')));
  return root;
}
