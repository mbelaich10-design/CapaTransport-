import express from 'express';
import path from 'node:path';
import { createSettingsRepo } from './repositories/settings.js';
import { createLeadsRepo } from './repositories/leads.js';
import { createSimulationsRepo } from './repositories/simulations.js';
import { createAuthService } from './services/auth.js';
import { createReportService } from './services/reporting/index.js';
import { createSimulationService } from './services/simulation.js';
import { errorHandler, notFoundApi, sameOrigin, securityHeaders } from './middleware/security.js';
import { publicRoutes } from './routes/public.js';
import { adminRoutes } from './routes/admin.js';

/** Assemble l'application (injection de la base et de l'env → testable sans démarrer de serveur). */
export function createApp({ db, env }) {
  const settings = createSettingsRepo(db);
  const leads = createLeadsRepo(db);
  const simulations = createSimulationsRepo(db);
  const auth = createAuthService(db, { sessionHours: env.sessionHours });
  const reports = createReportService({ simulations, settings });
  const simulationService = createSimulationService({ db, simulations, leads, settings, reports });

  const app = express();
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  app.use(securityHeaders({ production: env.production }));

  const api = express.Router();
  api.use(express.json({ limit: '32kb' }));
  api.use(sameOrigin);
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  api.use('/admin', adminRoutes({ auth, leads, simulations, settings, env }));
  api.use('/', publicRoutes({ simulationService, settings, env }));
  api.use(notFoundApi);
  app.use('/api', api);

  const pub = path.join(env.root, 'public');
  app.use('/shared', express.static(path.join(env.root, 'shared'), { maxAge: env.production ? '1h' : 0 }));
  app.use(express.static(pub, { extensions: ['html'], maxAge: env.production ? '1h' : 0, index: 'index.html' }));

  // Interface d'administration : application monopage, routage côté client.
  app.get(['/admin', '/admin/*splat'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.sendFile(path.join(pub, 'admin.html'));
  });
  // Le simulateur est aussi une SPA (résultats partageables via /resultats/:id).
  app.get(['/simulation', '/simulation/*splat', '/resultats/*splat'], (req, res) => res.sendFile(path.join(pub, 'index.html')));

  app.use((req, res) => res.status(404).sendFile(path.join(pub, '404.html')));
  app.use(errorHandler);

  return { app, services: { settings, leads, simulations, auth, reports, simulationService } };
}
