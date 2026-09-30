export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Une erreur est survenue.');
    this.status = status;
    this.fields = body?.fields || null;
  }
}

/** Appel JSON. Les jetons CSRF de l'admin sont ajoutés via setCsrf(). */
let csrf = '';
export const setCsrf = (v) => { csrf = v; };

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { error: 'Connexion impossible. Vérifiez votre réseau et réessayez.' });
  }
  let json = null;
  try { json = await res.json(); } catch { /* corps vide */ }
  if (!res.ok) throw new ApiError(res.status, json);
  return json;
}
