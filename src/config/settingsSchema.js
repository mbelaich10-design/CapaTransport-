// SOURCE UNIQUE des paramètres modifiables du simulateur.
// Chaque entrée fournit : valeur par défaut, validation, libellé et groupe d'affichage.
// L'interface d'administration (/admin/parametres) est GÉNÉRÉE depuis ce schéma :
// ajouter un paramètre = ajouter une ligne ici, sans toucher au reste du code.
//
// Les valeurs par défaut ci-dessous sont des ordres de grandeur INDICATIFS de départ.
// Elles doivent être validées/ajustées par l'équipe CapaTransport depuis l'administration.

export const SETTINGS_GROUPS = [
  { id: 'fuel', label: 'Carburant et consommation', help: 'Valeurs pré-remplies à l’étape « Mon véhicule ».' },
  { id: 'vehicle', label: 'Coût du véhicule', help: 'Coût mensuel pré-rempli selon le type de transport (modifiable par l’utilisateur).' },
  { id: 'charges', label: 'Charges par défaut', help: 'Valeurs pré-remplies à l’étape « Mes charges ».' },
  { id: 'simulator', label: 'Paramètres généraux du simulateur', help: 'Comportement général de l’outil.' },
  { id: 'offer', label: 'Offre CapaTransport Formation', help: 'Bouton d’accompagnement affiché après les résultats.' },
];

const money = (key, label, def, group, extra = {}) => ({ key, label, group, type: 'number', unit: '€', min: 0, max: 20000, step: 1, default: def, public: true, ...extra });

export const SETTINGS_SCHEMA = [
  { key: 'fuelPrice', label: 'Prix du carburant par défaut', group: 'fuel', type: 'number', unit: '€/L', min: 0.5, max: 5, step: 0.01, default: 1.85, public: true },
  { key: 'consumptionLight', label: 'Consommation par défaut — transport léger', group: 'fuel', type: 'number', unit: 'L/100 km', min: 1, max: 80, step: 0.1, default: 8.5, public: true },
  { key: 'consumptionHeavy', label: 'Consommation par défaut — transport lourd', group: 'fuel', type: 'number', unit: 'L/100 km', min: 1, max: 80, step: 0.1, default: 28, public: true },

  money('vehicleMonthlyLight', 'Coût mensuel véhicule par défaut — léger', 450, 'vehicle'),
  money('vehicleMonthlyHeavy', 'Coût mensuel véhicule par défaut — lourd', 1800, 'vehicle'),

  money('insuranceLight', 'Assurance par défaut — léger', 120, 'charges'),
  money('insuranceHeavy', 'Assurance par défaut — lourd', 450, 'charges'),
  { key: 'maintenancePerKmLight', label: 'Coût d’entretien au km — léger', group: 'charges', type: 'number', unit: '€/km', min: 0, max: 5, step: 0.01, default: 0.08, public: true },
  { key: 'maintenancePerKmHeavy', label: 'Coût d’entretien au km — lourd', group: 'charges', type: 'number', unit: '€/km', min: 0, max: 5, step: 0.01, default: 0.15, public: true },
  money('tolls', 'Péages par défaut', 60, 'charges'),
  money('phone', 'Téléphone par défaut', 30, 'charges'),
  money('software', 'Logiciel par défaut', 25, 'charges'),
  money('accounting', 'Comptabilité par défaut', 90, 'charges'),
  money('otherCharges', 'Autres coûts par défaut', 100, 'charges', { max: 50000 }),

  { key: 'daysPerMonthDefault', label: 'Jours travaillés par mois pré-remplis', group: 'simulator', type: 'number', unit: 'jours', min: 1, max: 31, step: 1, default: 20, public: true },
  { key: 'targetIncomePresets', label: 'Suggestions de revenu mensuel souhaité', group: 'simulator', type: 'numberList', unit: '€', min: 100, max: 50000, maxItems: 6, default: [1500, 2000, 3000, 4000], public: true, help: 'Liste de montants séparés par des virgules.' },
  { key: 'reportEmailEnabled', label: 'Envoi automatique du rapport par email', group: 'simulator', type: 'boolean', default: false, public: false, help: 'À activer uniquement quand un service d’email est configuré (voir docs/ARCHITECTURE.md).' },

  { key: 'offerUrl', label: 'URL de l’offre CapaTransport Formation', group: 'offer', type: 'url', default: 'https://example.com/', public: true, help: 'À remplacer par l’URL réelle de votre offre avant la mise en ligne.' },
  { key: 'offerCtaLabel', label: 'Libellé du bouton', group: 'offer', type: 'text', maxLength: 60, default: 'Découvrir l’accompagnement', public: true },
];

export const SETTINGS_BY_KEY = Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s]));
export const DEFAULT_SETTINGS = Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s.default]));

/** Valide UNE valeur selon le schéma. Retourne { value } ou { error }. */
export function validateSettingValue(def, raw) {
  switch (def.type) {
    case 'number': {
      const n = typeof raw === 'string' ? Number(raw.replace(',', '.')) : raw;
      if (typeof n !== 'number' || !Number.isFinite(n)) return { error: `${def.label} : nombre invalide.` };
      if (n < def.min || n > def.max) return { error: `${def.label} : doit être compris entre ${def.min} et ${def.max}.` };
      return { value: Math.round(n * 1000) / 1000 };
    }
    case 'numberList': {
      const parts = Array.isArray(raw) ? raw : String(raw ?? '').split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      const nums = parts.map((p) => (typeof p === 'number' ? p : Number(String(p).replace(',', '.'))));
      if (!nums.length || nums.length > def.maxItems || nums.some((n) => !Number.isFinite(n) || n < def.min || n > def.max)) {
        return { error: `${def.label} : 1 à ${def.maxItems} montants entre ${def.min} et ${def.max}.` };
      }
      return { value: [...new Set(nums.map(Math.round))].sort((a, b) => a - b) };
    }
    case 'boolean':
      if (typeof raw !== 'boolean') return { error: `${def.label} : valeur invalide.` };
      return { value: raw };
    case 'url': {
      let u;
      try { u = new URL(String(raw).trim()); } catch { return { error: `${def.label} : URL invalide.` }; }
      if (!['http:', 'https:'].includes(u.protocol)) return { error: `${def.label} : l’URL doit commencer par http:// ou https://.` };
      if (String(raw).length > 500) return { error: `${def.label} : URL trop longue.` };
      return { value: u.toString() };
    }
    case 'text': {
      const s = typeof raw === 'string' ? raw.trim() : '';
      if (!s || s.length > def.maxLength) return { error: `${def.label} : entre 1 et ${def.maxLength} caractères.` };
      return { value: s };
    }
    default:
      return { error: 'Type de paramètre inconnu.' };
  }
}
