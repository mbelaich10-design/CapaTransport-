# Architecture du MVP

Le dépôt était vide au démarrage : aucune convention préexistante à respecter, aucune fonctionnalité à préserver.

## Décisions techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Runtime / serveur | Node 22 + Express 5 (seule dépendance runtime) | Simple, largement connu, hébergeable partout |
| Base de données | SQLite via `node:sqlite` (intégré à Node) | Zéro dépendance native, déploiement trivial, suffisant pour un MVP. L'accès aux données est isolé dans `src/repositories/` et les migrations sont versionnées : passer à PostgreSQL ne touche que cette couche |
| Frontend | Modules ES natifs, sans build ni framework | Chargement rapide sur mobile, rien à compiler, CSP stricte (aucun script/style inline) |
| Calculs et validation | `shared/` (JS pur) exécuté **dans le navigateur et sur le serveur** | Aperçu en direct identique au résultat final ; le serveur recalcule toujours (le client ne peut pas imposer de résultats) |
| Paramètres | `src/config/settingsSchema.js` = source unique (défaut + validation + libellé + groupe) | L'écran d'admin est *généré* depuis ce schéma : ajouter un paramètre = 1 ligne |
| Authentification admin | Mot de passe scrypt, sessions serveur révocables (cookie `HttpOnly`, `SameSite=Strict`, `Secure` en prod), jeton CSRF + contrôle d'`Origin` | Pas de JWT (non révocable) ; pas de secret à gérer |

## Arborescence

```
server.js                 démarrage (env, base, admin initial)
src/app.js                assemblage de l'application (testable sans réseau)
src/config/               env.js (déploiement) · settingsSchema.js (métier)
src/db/                   connexion + migrations versionnées
src/repositories/         accès données : leads, simulations, settings
src/services/             simulation (cas d'usage), auth, csv, reporting/ (email)
src/routes/               public.js · admin.js
src/middleware/           en-têtes de sécurité, rate limit, erreurs
shared/                   rules · validate · calc · analysis · format  (navigateur + serveur)
public/                   index.html · admin.html · css/ · js/simulator · js/admin
tests/                    unitaires, API, e2e navigateur
```

## Parcours et données

1. Le visiteur remplit 5 étapes (projet, véhicule, activité, charges, objectif). Brouillon conservé localement (`localStorage`), valeurs pré-remplies issues de `/api/config`.
2. `POST /api/simulations` : validation, calcul, enregistrement (saisies **et** résultats, plus les hypothèses de calcul figées). Réponse = **aperçu** uniquement (CA, charges, résultat).
3. `POST /api/simulations/:id/lead` : enregistre le prospect (un prospect = un email, mis à jour s'il revient), rattache la simulation, **débloque** marge, seuil, objectif, graphiques et analyse. Le serveur n'envoie jamais ces données avant le déblocage.
4. L'identifiant public d'une simulation est un jeton aléatoire de 128 bits (lien `/resultats/:id`).

Tables : `leads`, `simulations`, `settings`, `admin_users` (+ `admin_sessions`, `schema_migrations`).
`simulations.inputs_json` / `results_json` contiennent l'instantané complet ; quelques colonnes dénormalisées (type, activité, CA, charges, résultat) servent aux filtres, agrégats et exports. Le consentement marketing est stocké séparément (booléen + horodatage + version du texte).

## Formules (`shared/calc.js`, `CALC_VERSION = 1`)

```
CA mensuel        = jours × courses/jour × prix moyen
CA annuel         = CA mensuel × 12
Km mensuels       = jours × courses/jour × distance moyenne
Carburant         = km × conso / 100 × prix du litre
Entretien         = saisi, sinon km × coût d'entretien au km (paramètre, figé dans la simulation)
Charges           = véhicule + carburant + assurance + entretien + péages + téléphone + logiciel + compta + autres
Résultat          = CA − charges          (avant rémunération ; cotisations sociales et impôts NON inclus)
Marge             = résultat / CA
```

Charges **variables** = carburant, entretien, péages ; **fixes** = le reste.

```
Seuil de rentabilité = fixes / (1 − variables/CA)          (inatteignable si variables ≥ CA)
CA pour objectif     = (fixes + revenu souhaité) / (1 − variables/CA)
Jours nécessaires    = CA visé / CA par jour
```

Les cotisations et l'impôt ne sont volontairement pas modélisés (ils dépendent du statut et de la situation) : l'interface le précise partout. Toute évolution de formule doit incrémenter `CALC_VERSION`.

## Validation et cohérence

Une seule implémentation (`shared/validate.js`) : bornes par champ, entiers, virgule décimale acceptée, clés inconnues ignorées, crédit/location exigent une mensualité > 0, plafond de 1 000 km/jour (courses × distance). Des avertissements non bloquants signalent des situations atypiques (CA/km hors plage, > 26 jours/mois…).

## Sécurité

CSP stricte (`default-src 'self'`), `X-Frame-Options: DENY`, `nosniff`, HSTS en production ; requêtes SQL paramétrées ; rendu DOM sans `innerHTML` ; corps JSON limité à 32 Ko ; rate limiting (création de simulation, capture de prospect, connexion) ; champ leurre anti-robot ; export CSV protégé contre l'injection de formules ; erreurs 500 sans détail ; adresse IP non stockée. Limite connue : le rate limiting est en mémoire (une seule instance ; utiliser Redis si plusieurs).

## Extensions prévues (non construites)

| Évolution | Où l'ajouter |
|---|---|
| Email automatique du rapport | `src/services/reporting/` : écrire un transport (`transports/<nom>.js` avec `send()`), l'enregistrer dans `TRANSPORTS`, choisir via `REPORT_TRANSPORT`, activer le paramètre admin. `simulations.report_status` (`queued/sent/failed`) suit l'envoi ; une tâche planifiée peut relancer les `queued` |
| Génération PDF | Consommer `sim.results` + `buildAnalysis()` (déjà indépendants de l'interface) |
| Espace utilisateur / historique | `leads` + `simulations.lead_id` existent ; ajouter une table `users` et l'authentification |
| Assistant IA, checklist, QCM, capacité financière | Nouvelles routes/services ; réutiliser `simulations` (`inputs_json`) comme contexte |
| Abonnement SaaS | Module de facturation à ajouter ; `admin_users` reste réservé à l'équipe |
| Autre moteur de calcul | Nouvelle version de `shared/calc.js` (`CALC_VERSION`) ; les anciennes simulations gardent leurs résultats |
