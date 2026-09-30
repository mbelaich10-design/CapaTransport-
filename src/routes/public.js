import express from 'express';
import { rateLimit } from '../middleware/security.js';

export function publicRoutes({ simulationService, settings, env }) {
  const router = express.Router();
  const createLimit = rateLimit({ windowMs: 3600_000, max: 40, enabled: env.rateLimit });
  const leadLimit = rateLimit({ windowMs: 3600_000, max: 12, enabled: env.rateLimit });

  // Paramètres publics uniquement (valeurs par défaut du formulaire, URL de l'offre).
  router.get('/config', (req, res) => {
    res.json({ settings: settings.getPublic() });
  });

  router.post('/simulations', createLimit, (req, res) => {
    const sim = simulationService.create(req.body?.input, req.body?.tracking);
    res.status(201).json(sim);
  });

  router.get('/simulations/:id', (req, res) => {
    const sim = simulationService.get(req.params.id);
    if (!sim) return res.status(404).json({ error: 'Simulation introuvable.' });
    res.json(sim);
  });

  router.post('/simulations/:id/lead', leadLimit, async (req, res) => {
    // Champ leurre invisible pour les humains : s'il est rempli, c'est un robot.
    if (typeof req.body?.website === 'string' && req.body.website.trim() !== '') {
      const sim = simulationService.get(req.params.id);
      return sim ? res.json(sim) : res.status(404).json({ error: 'Simulation introuvable.' });
    }
    const sim = await simulationService.captureLead(req.params.id, req.body?.lead);
    if (!sim) return res.status(404).json({ error: 'Simulation introuvable.' });
    res.json(sim);
  });

  return router;
}
