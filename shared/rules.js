// Règles métier partagées navigateur + serveur : listes de choix, bornes de saisie.
// Ce sont des règles de VALIDATION (cohérence des données), pas des valeurs par défaut :
// les valeurs par défaut modifiables vivent dans src/config/settingsSchema.js.

export const TRANSPORT_TYPES = [
  { value: 'light', label: 'Transport léger ≤ 3,5 t' },
  { value: 'heavy', label: 'Transport lourd > 3,5 t' },
  { value: 'unknown', label: 'Je ne sais pas encore' },
];

export const ACTIVITIES = [
  { value: 'delivery', label: 'Livraison' },
  { value: 'courier', label: 'Messagerie' },
  { value: 'subcontracting', label: 'Sous-traitance' },
  { value: 'moving', label: 'Déménagement' },
  { value: 'freight', label: 'Transport de marchandises' },
  { value: 'other', label: 'Autre' },
];

export const LEGAL_STATUSES = [
  { value: 'micro', label: 'Micro-entreprise' },
  { value: 'ei', label: 'EI' },
  { value: 'eurl', label: 'EURL' },
  { value: 'sasu', label: 'SASU' },
  { value: 'unknown', label: 'Je ne sais pas encore' },
];

export const VEHICLE_MODES = [
  { value: 'cash', label: 'Achat comptant' },
  { value: 'credit', label: 'Crédit' },
  { value: 'rental', label: 'Location' },
  { value: 'unknown', label: 'Je ne sais pas encore' },
];

export const LEAD_STATUSES = [
  { value: 'new', label: 'Nouveau' },
  { value: 'contacted', label: 'Contacté' },
  { value: 'qualified', label: 'Qualifié' },
  { value: 'converted', label: 'Converti' },
  { value: 'lost', label: 'Perdu' },
];

export const labelOf = (list, value) => list.find((o) => o.value === value)?.label ?? value ?? '';

// Bornes dures : au-delà, la saisie est refusée (erreur bloquante).
export const FIELD_LIMITS = {
  daysPerMonth: { min: 1, max: 31, integer: true, label: 'Jours travaillés par mois', unit: 'jours' },
  tripsPerDay: { min: 1, max: 100, integer: true, label: 'Courses par jour', unit: 'courses' },
  avgPrice: { min: 1, max: 5000, label: 'Prix moyen d’une course', unit: '€' },
  avgDistance: { min: 1, max: 1500, label: 'Distance moyenne d’une course', unit: 'km' },
  consumption: { min: 1, max: 80, label: 'Consommation moyenne', unit: 'L/100 km' },
  fuelPrice: { min: 0.5, max: 5, label: 'Prix du carburant', unit: '€/L' },
  vehicleMonthlyCost: { min: 0, max: 20000, label: 'Coût mensuel du véhicule', unit: '€/mois' },
  insurance: { min: 0, max: 20000, label: 'Assurance', unit: '€/mois' },
  maintenance: { min: 0, max: 20000, label: 'Entretien', unit: '€/mois' },
  tolls: { min: 0, max: 20000, label: 'Péages', unit: '€/mois' },
  phone: { min: 0, max: 20000, label: 'Téléphone', unit: '€/mois' },
  software: { min: 0, max: 20000, label: 'Logiciel', unit: '€/mois' },
  accounting: { min: 0, max: 20000, label: 'Comptabilité', unit: '€/mois' },
  otherCharges: { min: 0, max: 50000, label: 'Autres charges', unit: '€/mois' },
  targetIncome: { min: 100, max: 50000, integer: true, label: 'Revenu mensuel souhaité', unit: '€/mois' },
};

// Plafond de cohérence : un conducteur ne peut pas parcourir plus de km/jour que cela.
export const MAX_KM_PER_DAY = 1000;

// Seuils de plausibilité : n'empêchent pas la saisie, déclenchent un avertissement.
export const PLAUSIBILITY = {
  revenuePerKmMin: 0.4, // € de CA par km parcouru
  revenuePerKmMax: 8,
  daysWarn: 26,
};
