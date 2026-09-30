import { h, toast } from '../dom.js';
import { api, ApiError } from '../api.js';

// Formulaire GÉNÉRÉ depuis le schéma du serveur (src/config/settingsSchema.js).
export async function renderSettings(el) {
  const { groups, schema, values } = await api('GET', '/api/admin/settings');
  const inputs = {}; const errBoxes = {};

  const control = (def) => {
    const v = values[def.key];
    if (def.type === 'boolean') {
      const cb = h('input', { type: 'checkbox', id: `s-${def.key}`, checked: v === true });
      inputs[def.key] = { read: () => cb.checked, write: (x) => { cb.checked = x; } };
      return h('label', { class: 'switch', for: `s-${def.key}` }, cb, 'Activé');
    }
    const shown = def.type === 'numberList' ? v.join(', ') : String(v).replace('.', def.type === 'number' ? ',' : '.');
    const input = h('input', { class: 'input', id: `s-${def.key}`, type: def.type === 'url' ? 'url' : 'text', inputmode: def.type === 'number' ? 'decimal' : undefined, value: shown, autocomplete: 'off' });
    inputs[def.key] = { read: () => input.value, write: (x) => { input.value = def.type === 'numberList' ? x.join(', ') : String(x).replace('.', def.type === 'number' ? ',' : '.'); } };
    return h('div', { class: `input-wrap ${def.unit ? 'has-unit' : ''}` }, input, def.unit ? h('span', { class: 'unit' }, def.unit) : null);
  };

  const row = (def) => {
    const err = h('div', { class: 'field-error', role: 'alert', hidden: true });
    errBoxes[def.key] = err;
    return h('div', { class: 'set-row' },
      h('div', null, h('label', { for: `s-${def.key}` }, def.label), def.help ? h('p', { class: 'field-hint' }, def.help) : null,
        h('p', { class: 'field-hint' }, 'Valeur d’origine : ', h('button', { class: 'link-btn', type: 'button', onClick: () => inputs[def.key].write(def.default) }, def.type === 'boolean' ? (def.default ? 'activé' : 'désactivé') : Array.isArray(def.default) ? def.default.join(', ') : String(def.default).replace('.', ','))),
      ),
      h('div', null, control(def), err));
  };

  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Enregistrer les paramètres');
  const form = h('form', { novalidate: true, onSubmit: async (e) => {
    e.preventDefault(); save.disabled = true;
    for (const b of Object.values(errBoxes)) b.hidden = true;
    const payload = Object.fromEntries(Object.entries(inputs).map(([k, c]) => [k, c.read()]));
    try {
      await api('PUT', '/api/admin/settings', { values: payload });
      toast('Paramètres enregistrés. Ils s’appliquent aux prochaines simulations.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        for (const [k, msg] of Object.entries(err.fields)) if (errBoxes[k]) { errBoxes[k].hidden = false; errBoxes[k].textContent = msg; }
        document.querySelector('.field-error:not([hidden])')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      toast(err.message, 'err');
    } finally { save.disabled = false; }
  } },
    groups.map((g) => h('section', { class: 'a-card set-group' }, h('h2', null, g.label), g.help ? h('p', { class: 'muted' }, g.help) : null, schema.filter((s) => s.group === g.id).map(row))),
    h('div', { class: 'savebar' }, save, h('span', { class: 'muted' }, 'Les simulations déjà réalisées ne sont pas modifiées.')));

  el.replaceChildren(h('h1', null, 'Paramètres'), h('p', { class: 'muted' }, 'Valeurs par défaut et réglages du simulateur. Aucune modification de code n’est nécessaire.'), form);
}
