// Mini-bibliothèque DOM : construit des nœuds sans jamais interpréter de HTML (pas de XSS par conception).
const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

export function svg(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); // CSSOM : autorisé par la CSP
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden') el[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function icon(name, size = 20, cls = '') {
  const s = svg('svg', { width: size, height: size, 'aria-hidden': 'true', class: cls });
  const use = svg('use');
  use.setAttribute('href', `/sprite.svg#i-${name}`);
  s.append(use);
  return s;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export function toast(message, kind = 'ok', ms = 4000) {
  const area = document.getElementById('toasts');
  if (!area) return;
  const t = h('div', { class: `container narrow` }, h('div', { class: `banner ${kind}`, role: 'status', style: { pointerEvents: 'auto' } }, icon(kind === 'ok' ? 'check' : 'alert', 20), h('span', null, message)));
  area.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Stockage navigateur tolérant aux pannes (navigation privée, stockage bloqué). */
export const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignoré */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignoré */ } },
};
