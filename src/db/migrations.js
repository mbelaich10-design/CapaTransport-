// Migrations ordonnées et append-only. Ne jamais modifier une migration déjà déployée :
// en ajouter une nouvelle. La version appliquée est suivie dans la table schema_migrations.
export const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      CREATE TABLE admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        last_login_at TEXT
      );

      CREATE TABLE admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        expires_at TEXT NOT NULL
      );

      CREATE TABLE leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        phone TEXT,
        marketing_consent INTEGER NOT NULL DEFAULT 0,
        marketing_consent_at TEXT,
        consent_text_version TEXT,
        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','converted','lost')),
        source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX idx_leads_created_at ON leads(created_at);
      CREATE INDEX idx_leads_status ON leads(status);

      CREATE TABLE simulations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_id TEXT NOT NULL UNIQUE,
        lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        calc_version INTEGER NOT NULL,
        inputs_json TEXT NOT NULL,
        results_json TEXT NOT NULL,
        -- Colonnes dénormalisées pour filtres, agrégats et exports (source : results_json)
        transport_type TEXT NOT NULL,
        activity TEXT NOT NULL,
        legal_status TEXT NOT NULL,
        revenue_monthly REAL NOT NULL,
        charges_monthly REAL NOT NULL,
        result_monthly REAL NOT NULL,
        source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        report_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (report_status IN ('not_requested','queued','sent','failed')),
        report_sent_at TEXT
      );
      CREATE INDEX idx_simulations_created_at ON simulations(created_at);
      CREATE INDEX idx_simulations_lead_id ON simulations(lead_id);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
    `,
  },
];
