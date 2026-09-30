// Envoi du rapport par email — ARCHITECTURE PRÊTE, transport désactivé par défaut.
//
// Pour brancher un service d'email (Resend, Brevo, SES, SMTP…) :
//   1. créer src/services/reporting/transports/<nom>.js exportant { name, send({to, subject, text, html}) }
//   2. l'enregistrer dans TRANSPORTS ci-dessous et le sélectionner via la variable REPORT_TRANSPORT
//   3. activer le paramètre « Envoi automatique du rapport par email » dans l'administration
// Tant qu'aucun transport n'est configuré, les simulations restent en statut « queued »
// (file d'attente) et aucun email n'est prétendument envoyé.

import { disabledTransport } from './transports/disabled.js';

const TRANSPORTS = { disabled: disabledTransport };

export function createReportService({ simulations, settings, transportName = process.env.REPORT_TRANSPORT || 'disabled' }) {
  const transport = TRANSPORTS[transportName] ?? disabledTransport;
  return {
    transportName: transport.name,
    /** Tente l'envoi du rapport d'une simulation rattachée à un prospect. Ne lève jamais d'erreur. */
    async sendReport(simulationId, lead) {
      if (!settings.getAll().reportEmailEnabled || transport.name === 'disabled') return { status: 'queued' };
      try {
        // Le rendu email/PDF du rapport viendra ici (voir docs/ARCHITECTURE.md, « Extensions »).
        await transport.send({ to: lead.email, subject: 'Votre rapport CapaTransport', text: 'Votre rapport est disponible.' });
        simulations.setReportStatus(simulationId, 'sent');
        return { status: 'sent' };
      } catch (err) {
        console.error('[report] échec envoi', err.message);
        simulations.setReportStatus(simulationId, 'failed');
        return { status: 'failed' };
      }
    },
  };
}
