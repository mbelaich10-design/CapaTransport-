import crypto from 'node:crypto';

const publicId = () => crypto.randomBytes(16).toString('base64url'); // 128 bits, non devinable

export function createSimulationsRepo(db) {
  return {
    create({ input, results, tracking }) {
      const id = publicId();
      const r = db.prepare(`INSERT INTO simulations (public_id, calc_version, inputs_json, results_json, transport_type, activity,
          legal_status, revenue_monthly, charges_monthly, result_monthly, source, utm_medium, utm_campaign)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        id, results.calcVersion, JSON.stringify(input), JSON.stringify(results), input.project.transportType,
        input.project.activity, input.project.legalStatus, results.monthly.revenue, results.monthly.totalCharges,
        results.monthly.result, tracking.source, tracking.utmMedium, tracking.utmCampaign);
      return { id: Number(r.lastInsertRowid), publicId: id };
    },

    getByPublicId(pid) {
      if (typeof pid !== 'string' || pid.length < 10 || pid.length > 40) return null;
      const row = db.prepare('SELECT * FROM simulations WHERE public_id = ?').get(pid);
      return row ? hydrate(row) : null;
    },

    getById(id) {
      const row = db.prepare('SELECT * FROM simulations WHERE id = ?').get(id);
      return row ? hydrate(row) : null;
    },

    latestForLead(leadId) {
      const row = db.prepare('SELECT * FROM simulations WHERE lead_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get(leadId);
      return row ? hydrate(row) : null;
    },

    attachLead(id, leadId) {
      db.prepare("UPDATE simulations SET lead_id = ?, report_status = CASE WHEN report_status = 'not_requested' THEN 'queued' ELSE report_status END WHERE id = ?").run(leadId, id);
    },

    setReportStatus(id, status) {
      db.prepare('UPDATE simulations SET report_status = ?, report_sent_at = ? WHERE id = ?').run(status, status === 'sent' ? new Date().toISOString() : null, id);
    },

    stats() {
      const one = (sql, ...p) => db.prepare(sql).get(...p);
      const total = one('SELECT COUNT(*) AS n FROM simulations').n;
      const withLead = one('SELECT COUNT(*) AS n FROM simulations WHERE lead_id IS NOT NULL').n;
      const leads = one('SELECT COUNT(*) AS n FROM leads').n;
      const since = (ms) => new Date(Date.now() - ms).toISOString();
      const avg = one('SELECT AVG(revenue_monthly) AS revenue, AVG(result_monthly) AS result FROM simulations');
      const daily = db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS n FROM simulations
        WHERE created_at >= ? GROUP BY day ORDER BY day`).all(since(14 * 86400000));
      return {
        totalSimulations: total,
        totalLeads: leads,
        conversionRate: total ? withLead / total : 0,
        simulations24h: one('SELECT COUNT(*) AS n FROM simulations WHERE created_at >= ?', since(86400000)).n,
        simulations7d: one('SELECT COUNT(*) AS n FROM simulations WHERE created_at >= ?', since(7 * 86400000)).n,
        avgRevenue: avg.revenue,
        avgResult: avg.result,
        daily,
      };
    },
  };
}

function hydrate(row) {
  return {
    id: row.id, publicId: row.public_id, leadId: row.lead_id, createdAt: row.created_at,
    input: JSON.parse(row.inputs_json), results: JSON.parse(row.results_json),
    reportStatus: row.report_status, source: row.source, utmMedium: row.utm_medium, utmCampaign: row.utm_campaign,
  };
}
