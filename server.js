import { loadEnv } from './src/config/env.js';
import { openDatabase } from './src/db/index.js';
import { createApp } from './src/app.js';

const env = loadEnv();
const db = openDatabase(env.dbPath);
const { app, services } = createApp({ db, env });

// Premier démarrage : création de l'administrateur depuis l'environnement (jamais de mot de passe par défaut).
if (services.auth.countAdmins() === 0) {
  if (env.adminEmail && env.adminPassword) {
    try {
      await services.auth.createAdmin(env.adminEmail, env.adminPassword);
      console.log(`[admin] compte créé : ${env.adminEmail}`);
    } catch (err) { console.error(`[admin] création impossible : ${err.message}`); }
  } else {
    console.warn('[admin] Aucun administrateur. Lancez « npm run admin:create » ou définissez ADMIN_EMAIL et ADMIN_PASSWORD.');
  }
}

const server = app.listen(env.port, () => console.log(`CapaTransport : http://localhost:${env.port}`));
const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
