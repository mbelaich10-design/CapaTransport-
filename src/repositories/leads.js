export const LEAD_SORTS = {
  date: 'l.created_at',
  name: 'l.last_name COLLATE NOCASE',
  revenue: 's.revenue_monthly',
  result: 's.result_monthly',
  status: 'l.status',
};

const LIST_SELECT = `
  SELECT l.id, l.first_name, l.last_name, l.email, l.phone, l.marketing_consent, l.status, l.source,
         l.utm_medium, l.utm_campaign, l.created_at,
         s.public_id AS simulation_public_id, s.activity, s.transport_type, s.legal_status,
         s.revenue_monthly, s.charges_monthly, s.result_monthly,
         (SELECT COUNT(*) FROM simulations x WHERE x.lead_id = l.id) AS simulations_count
  FROM leads l
  LEFT JOIN simulations s ON s.id = (SELECT id FROM simulations WHERE lead_id = l.id ORDER BY created_at DESC, id DESC LIMIT 1)`;

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function createLeadsRepo(db) {
  const byEmail = db.prepare('SELECT * FROM leads WHERE email = ?');
  const insert = db.prepare(`INSERT INTO leads (first_name, last_name, email, phone, marketing_consent, marketing_consent_at,
      consent_text_version, source, utm_medium, utm_campaign) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const update = db.prepare(`UPDATE leads SET first_name = ?, last_name = ?, phone = COALESCE(?, phone),
      marketing_consent = ?, marketing_consent_at = ?, consent_text_version = ?, updated_at = ? WHERE id = ?`);

  function where(f) {
    const clauses = []; const params = [];
    if (f.q) {
      const like = `%${escapeLike(f.q)}%`;
      clauses.push(`(l.first_name LIKE ? ESCAPE '\\' OR l.last_name LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\' OR COALESCE(l.phone,'') LIKE ? ESCAPE '\\' OR (l.first_name || ' ' || l.last_name) LIKE ? ESCAPE '\\')`);
      params.push(like, like, like, like, like);
    }
    if (f.status) { clauses.push('l.status = ?'); params.push(f.status); }
    if (f.activity) { clauses.push('s.activity = ?'); params.push(f.activity); }
    if (f.transportType) { clauses.push('s.transport_type = ?'); params.push(f.transportType); }
    if (f.source) { clauses.push('l.source = ?'); params.push(f.source); }
    if (f.consent === '1' || f.consent === '0') { clauses.push('l.marketing_consent = ?'); params.push(Number(f.consent)); }
    if (f.from) { clauses.push('date(l.created_at) >= ?'); params.push(f.from); }
    if (f.to) { clauses.push('date(l.created_at) <= ?'); params.push(f.to); }
    return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  function orderBy(f) {
    const col = LEAD_SORTS[f.sort] || LEAD_SORTS.date;
    return `ORDER BY ${col} ${f.dir === 'asc' ? 'ASC' : 'DESC'}, l.id DESC`;
  }

  return {
    /** Crée le prospect, ou met à jour celui qui a déjà cet email (une personne = un prospect). */
    upsertFromCapture(lead, tracking, consentTextVersion) {
      const existing = byEmail.get(lead.email);
      const now = new Date().toISOString();
      if (existing) {
        // Un consentement déjà donné n'est jamais retiré par une nouvelle saisie sans case cochée.
        const consent = existing.marketing_consent === 1 || lead.marketingConsent;
        const consentAt = existing.marketing_consent === 1 ? existing.marketing_consent_at : (lead.marketingConsent ? now : null);
        update.run(lead.firstName, lead.lastName, lead.phone, consent ? 1 : 0, consentAt,
          existing.marketing_consent === 1 ? existing.consent_text_version : (lead.marketingConsent ? consentTextVersion : null), now, existing.id);
        return { id: existing.id, created: false };
      }
      const r = insert.run(lead.firstName, lead.lastName, lead.email, lead.phone, lead.marketingConsent ? 1 : 0,
        lead.marketingConsent ? now : null, lead.marketingConsent ? consentTextVersion : null,
        tracking.source, tracking.utmMedium, tracking.utmCampaign);
      return { id: Number(r.lastInsertRowid), created: true };
    },

    get(id) {
      return db.prepare(`${LIST_SELECT} WHERE l.id = ?`).get(id);
    },

    list(f) {
      const w = where(f);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM leads l LEFT JOIN simulations s ON s.id = (SELECT id FROM simulations WHERE lead_id = l.id ORDER BY created_at DESC, id DESC LIMIT 1) ${w.sql}`).get(...w.params).n;
      const rows = db.prepare(`${LIST_SELECT} ${w.sql} ${orderBy(f)} LIMIT ? OFFSET ?`).all(...w.params, f.pageSize, (f.page - 1) * f.pageSize);
      return { rows, total };
    },

    /** Export : mêmes filtres, sans pagination (plafonné par sécurité). */
    listAll(f, cap = 50000) {
      const w = where(f);
      return db.prepare(`${LIST_SELECT} ${w.sql} ${orderBy(f)} LIMIT ${cap}`).all(...w.params);
    },

    setStatus(id, status) {
      const r = db.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), id);
      return r.changes > 0;
    },

    distinctSources() {
      return db.prepare("SELECT DISTINCT source FROM leads WHERE source IS NOT NULL ORDER BY source").all().map((r) => r.source);
    },
  };
}
