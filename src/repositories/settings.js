import { DEFAULT_SETTINGS, SETTINGS_BY_KEY, SETTINGS_SCHEMA } from '../config/settingsSchema.js';

export function createSettingsRepo(db) {
  const selectAll = db.prepare('SELECT key, value_json FROM settings');
  const upsert = db.prepare(`INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`);

  return {
    /** Valeurs effectives = défauts du schéma surchargés par la base. Clés inconnues ignorées. */
    getAll() {
      const out = { ...DEFAULT_SETTINGS };
      for (const row of selectAll.all()) {
        if (!SETTINGS_BY_KEY[row.key]) continue;
        try { out[row.key] = JSON.parse(row.value_json); } catch { /* valeur corrompue : on garde le défaut */ }
      }
      return out;
    },
    /** Valeurs exposables au public (formulaire), jamais les paramètres internes. */
    getPublic() {
      const all = this.getAll();
      return Object.fromEntries(SETTINGS_SCHEMA.filter((s) => s.public).map((s) => [s.key, all[s.key]]));
    },
    setMany(values) {
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        for (const [key, value] of Object.entries(values)) upsert.run(key, JSON.stringify(value), now);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
