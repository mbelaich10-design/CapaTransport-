# CapaTransport — Simulateur de projet transport

Application web (frontend + backend + base de données + administration) qui permet à un futur
transporteur de simuler la rentabilité de son projet, et à CapaTransport Formation de collecter
des prospects qualifiés.

> « Votre projet de transport est-il rentable ? »

## Démarrage rapide

Prérequis : **Node.js ≥ 22.13** (utilise `node:sqlite`, aucune dépendance native).

```bash
npm install
ADMIN_EMAIL=vous@exemple.fr ADMIN_PASSWORD='un-mot-de-passe-de-12-caracteres+' npm start
# → http://localhost:3000        (simulateur)
# → http://localhost:3000/admin  (administration)
```

- `npm run admin:create -- email@exemple.fr` : crée un administrateur (mot de passe saisi sans écho, 12 caractères min.).
- `npm run seed:demo` : données fictives pour explorer l'admin (**développement uniquement**).
- `npm test` : tests unitaires et d'intégration (calculs, validation, API, sécurité admin, CSV).
- `npm run test:e2e` : parcours complet dans un vrai navigateur (mobile + desktop + admin), captures dans `tests/e2e/out/`.
  Si Chromium est déjà installé : `CHROMIUM_PATH=/chemin/vers/chrome npm run test:e2e`.

Variables d'environnement : voir `.env.example`. Aucun mot de passe par défaut n'existe.

## À faire avant la mise en ligne (décisions qui vous appartiennent)

1. **URL de l'offre** : Admin → Paramètres → « URL de l'offre CapaTransport Formation » (valeur par défaut factice : `https://example.com/`).
2. **Valeurs par défaut** (assurance, entretien/km, véhicule, consommation, etc.) : ce sont des ordres de grandeur *indicatifs de départ* à valider par vos experts, dans Admin → Paramètres.
3. **Textes légaux** : `public/confidentialite.html` décrit le fonctionnement actuel mais doit être complété/validé (responsable de traitement, contact, durée de conservation). Ajouter des mentions légales.
4. **Envoi d'email du rapport** : non branché (voir `docs/ARCHITECTURE.md`). En attendant, le prospect voit immédiatement son rapport complet et peut l'imprimer/l'enregistrer en PDF ; la simulation est en statut `queued`.
5. **Hébergement** : HTTPS obligatoire, `NODE_ENV=production`, `TRUST_PROXY` si derrière un proxy, volume persistant pour `DATABASE_PATH`, sauvegardes du fichier SQLite.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, décisions techniques, formules, modèle de données, sécurité, points d'extension.
