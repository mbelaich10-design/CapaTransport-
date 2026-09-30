import { previewOf, simulate } from '../../shared/calc.js';
import { buildAnalysis } from '../../shared/analysis.js';
import { validateLead, validateSimulationInput } from '../../shared/validate.js';
import { transaction } from '../db/index.js';

export const CONSENT_TEXT_VERSION = '2026-09-v1';

const clean = (v, max = 60) => {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, '').slice(0, max);
  return s || null;
};

/** Attribution marketing : uniquement des jetons courts et assainis. */
export function sanitizeTracking(t = {}) {
  return { source: clean(t?.source) || 'direct', utmMedium: clean(t?.utmMedium), utmCampaign: clean(t?.utmCampaign, 80) };
}

export class ValidationError extends Error {
  constructor(errors) { super('Données invalides.'); this.status = 422; this.errors = errors; }
}

/** Hypothèses de calcul figées au moment de la simulation, selon le type de transport. */
export function assumptionsFor(input, settings) {
  const heavy = input.project.transportType === 'heavy';
  return { maintenancePerKm: heavy ? settings.maintenancePerKmHeavy : settings.maintenancePerKmLight };
}

/** Vue d'une simulation : aperçu tant que le prospect n'est pas capturé, résultat complet ensuite. */
export function present(sim) {
  const unlocked = sim.leadId != null;
  return {
    id: sim.publicId,
    createdAt: sim.createdAt,
    unlocked,
    reportStatus: sim.reportStatus,
    input: sim.input,
    results: unlocked ? sim.results : previewOf(sim.results),
    analysis: unlocked ? buildAnalysis(sim.results) : undefined,
  };
}

export function createSimulationService({ db, simulations, leads, settings, reports }) {
  return {
    create(rawInput, rawTracking) {
      const v = validateSimulationInput(rawInput);
      if (!v.ok) throw new ValidationError(v.errors);
      const results = simulate(v.value, assumptionsFor(v.value, settings.getAll()));
      const stored = simulations.create({ input: v.value, results, tracking: sanitizeTracking(rawTracking) });
      return present(simulations.getById(stored.id));
    },

    get(publicId) {
      const sim = simulations.getByPublicId(publicId);
      return sim ? present(sim) : null;
    },

    /** Enregistre le prospect, rattache la simulation et débloque le résultat complet. */
    async captureLead(publicId, rawLead) {
      const sim = simulations.getByPublicId(publicId);
      if (!sim) return null;
      const v = validateLead(rawLead);
      if (!v.ok) throw new ValidationError(v.errors);
      const lead = transaction(db, () => {
        const tracking = { source: sim.source, utmMedium: sim.utmMedium, utmCampaign: sim.utmCampaign };
        const r = leads.upsertFromCapture(v.value, tracking, CONSENT_TEXT_VERSION);
        simulations.attachLead(sim.id, r.id);
        return { id: r.id, email: v.value.email };
      });
      await reports.sendReport(sim.id, lead); // n'échoue jamais ; statut mis à jour en base
      return present(simulations.getById(sim.id));
    },
  };
}
