import { h, icon } from '../dom.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

/** Champ = { el, setError(msg) } ; les erreurs sont mises à jour sur place (pas de re-rendu → le clavier mobile reste ouvert). */
function shell({ path, label, hint, control, labelFor, ariaLabelledBy }) {
  const errId = nextId('err'); const hintId = nextId('hint');
  const errBox = h('div', { class: 'field-error', id: errId, role: 'alert', hidden: true });
  const el = h('div', { class: 'field', dataset: { path } },
    labelFor ? h('label', { for: labelFor }, label) : h('div', { class: 'field-label', id: ariaLabelledBy }, label),
    hint ? h('p', { class: 'field-hint', id: hintId }, hint) : null,
    control, errBox);
  const setError = (msg) => {
    errBox.hidden = !msg;
    errBox.replaceChildren(...(msg ? [icon('alert', 18), h('span', null, msg)] : []));
    for (const i of el.querySelectorAll('input.input')) {
      if (msg) { i.setAttribute('aria-invalid', 'true'); i.setAttribute('aria-describedby', errId); } else { i.removeAttribute('aria-invalid'); i.removeAttribute('aria-describedby'); }
    }
  };
  return { el, setError, errBox };
}

/** Groupe de choix exclusifs (cartes radio accessibles). */
export function choiceField(ctx, { path, label, hint, options, cols = 1 }) {
  const [section, key] = path.split('.');
  const name = nextId('grp'); const labelId = nextId('lbl');
  const inputs = options.map((o) => {
    const input = h('input', { type: 'radio', name, value: o.value, checked: ctx.draft[section][key] === o.value, onChange: () => {
      ctx.draft[section][key] = o.value; ctx.draft.touched[path] = true; ctx.save(); f.setError(''); ctx.onChange?.(path);
    } });
    return h('label', { class: 'choice' }, input, h('span', null, o.label));
  });
  const control = h('div', { class: `choices ${cols === 2 ? 'two' : cols === 'yesno' ? 'yesno' : ''}`, role: 'radiogroup', 'aria-labelledby': labelId }, inputs);
  const f = shell({ path, label, hint, control, ariaLabelledBy: labelId });
  return f;
}

/** Saisie numérique avec unité. inputmode=decimal → clavier numérique sur mobile. */
export function numberField(ctx, { path, label, hint, unit, placeholder, decimal = true, note }) {
  const [section, key] = path.split('.');
  const id = nextId('in');
  const input = h('input', {
    class: 'input', id, type: 'text', inputmode: decimal ? 'decimal' : 'numeric', autocomplete: 'off', enterkeyhint: 'next',
    placeholder: placeholder ?? '', value: ctx.draft[section][key] ?? '',
    onInput: (e) => {
      ctx.draft[section][key] = e.target.value; ctx.draft.touched[path] = true; ctx.save(); f.setError(''); ctx.onChange?.(path);
    },
  });
  const wrap = h('div', { class: `input-wrap ${unit ? 'has-unit' : ''}` }, input, unit ? h('span', { class: 'unit' }, unit) : null);
  const noteEl = note ? h('div', { class: 'auto-note' }) : null;
  const f = shell({ path, label, hint, control: h('div', null, wrap, noteEl), labelFor: id });
  f.input = input; f.noteEl = noteEl;
  return f;
}

export function chips(values, onPick, format) {
  return h('div', { class: 'chips' }, values.map((v) => h('button', { type: 'button', class: 'chip', onClick: () => onPick(v) }, format(v))));
}

/** Champ texte simple (formulaire prospect). */
export function textField({ name, label, type = 'text', autocomplete, inputmode, required = true, hint }) {
  const id = nextId('tf');
  const input = h('input', { class: 'input', id, name, type, autocomplete, inputmode, required: required ? true : undefined, maxlength: '254' });
  const f = shell({ path: name, label: required ? label : `${label} (facultatif)`, hint, control: input, labelFor: id });
  f.input = input;
  return f;
}
