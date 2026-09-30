// Application d'administration (monopage, routes /admin, /admin/prospects, /admin/parametres).
import { clear, h, icon } from '../dom.js';
import { api, ApiError, setCsrf } from '../api.js';
import { renderDashboard } from './dashboard.js';
import { renderProspects } from './prospects.js';
import { renderSettings } from './settings.js';

const root = document.getElementById('root');
let admin = null;

const ROUTES = [
  { path: '/admin', label: 'Tableau de bord', render: renderDashboard },
  { path: '/admin/prospects', label: 'Prospects', render: renderProspects },
  { path: '/admin/parametres', label: 'Paramètres', render: renderSettings },
];

function navigate(path) { history.pushState(null, '', path); route(); }
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', route);

function renderLogin(message) {
  const email = h('input', { class: 'input', id: 'a-email', type: 'email', autocomplete: 'username', required: true });
  const pwd = h('input', { class: 'input', id: 'a-pwd', type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'banner err', role: 'alert', hidden: !message }, message ?? '');
  const btn = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Se connecter');
  clear(root).append(h('div', { class: 'login' }, h('form', { class: 'a-card login-card', onSubmit: async (e) => {
    e.preventDefault(); err.hidden = true; btn.disabled = true;
    try {
      const r = await api('POST', '/api/admin/login', { email: email.value, password: pwd.value });
      admin = r.admin; setCsrf(r.csrf); route();
    } catch (ex) {
      err.hidden = false; err.textContent = ex.message; btn.disabled = false; pwd.value = '';
    }
  } },
    h('a', { class: 'brand', href: '/', style: { marginBottom: '18px' } }, h('span', { class: 'brand-mark' }, icon('truck', 20)), h('span', null, 'CapaTransport', h('small', null, 'Administration'))),
    h('div', { class: 'field' }, h('label', { for: 'a-email' }, 'Email'), email),
    h('div', { class: 'field' }, h('label', { for: 'a-pwd' }, 'Mot de passe'), pwd),
    err, btn)));
  email.focus();
}

function shell(current, content) {
  return h('div', null,
    h('header', { class: 'a-top' }, h('div', { class: 'container' },
      h('a', { class: 'brand', href: '/admin', 'data-link': true }, h('span', { class: 'brand-mark' }, icon('truck', 20)), h('span', null, 'CapaTransport', h('small', null, 'Administration'))),
      h('nav', { class: 'a-nav', 'aria-label': 'Administration' }, ROUTES.map((r) => h('a', { href: r.path, 'data-link': true, 'aria-current': r === current ? 'page' : undefined }, r.label))),
      h('div', { class: 'a-user' }, h('span', null, admin.email), h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: logout }, 'Déconnexion')))),
    h('main', { class: 'a-main' }, content));
}

async function logout() {
  try { await api('POST', '/api/admin/logout', {}); } catch { /* session déjà expirée */ }
  admin = null; setCsrf(''); renderLogin();
}

async function route() {
  if (!admin) return renderLogin();
  const path = location.pathname.replace(/\/+$/, '') || '/admin';
  const current = ROUTES.find((r) => r.path === path);
  if (!current) return navigate('/admin');
  document.title = `${current.label} — Administration CapaTransport`;
  const content = h('div', null, h('div', { class: 'loading' }, h('span', { class: 'spinner dark' })));
  clear(root).append(shell(current, content));
  try {
    await current.render(content, { navigate });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) { admin = null; return renderLogin('Session expirée, merci de vous reconnecter.'); }
    content.replaceChildren(h('div', { class: 'banner err' }, icon('alert', 20), h('span', null, err.message)));
  }
}

try {
  const me = await api('GET', '/api/admin/me');
  admin = me.admin; setCsrf(me.csrf);
} catch { admin = null; }
route();
