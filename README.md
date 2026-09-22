# Pilotage Audit

Application de suivi et de planification des audits internes/externes et des
tests d'intrusion (**TI**) : catégorisation, planification multi-échelles, kanban
configurable, plans de charge des pilotes et auditeurs, suivi des prestataires,
pré-requis par catégorie, documents techniques, tableaux de bord et import en
masse. **Ne stocke ni les résultats d'audit ni les vulnérabilités** (hors
périmètre par choix).

## Stack technique

- **Backend** : Python / FastAPI / SQLAlchemy 2 / PostgreSQL 16, authentification
  JWT locale (+ point d'extension SSO/OIDC)
- **Frontend** : React + TypeScript + Vite + MUI, graphiques en SVG sans
  dépendance externe
- **Déploiement** : Docker Compose (`db`, `backend`, `frontend`), multi-plateforme

## Démarrage rapide (Docker)

1. Copier le fichier d'environnement et renseigner des valeurs (mots de passe,
   `SECRET_KEY`) :
   ```bash
   cp .env.example .env
   ```
2. Construire et lancer les conteneurs :
   ```bash
   docker compose up --build -d
   ```
3. Ouvrir <http://localhost:9090>.
4. Se connecter avec le compte administrateur créé au premier démarrage
   (`ADMIN_EMAIL` / `ADMIN_PASSWORD`), **changer immédiatement son mot de passe**,
   puis créer les comptes des pilotes d'audit et responsables de service.

Les documents déposés sont conservés dans le volume `uploads_data`, la base dans
`db_data` : ce sont les deux éléments à sauvegarder.

## Fonctionnalités

### Pilotage
- **Kanban entièrement configurable** depuis le panneau d'administration :
  création, renommage, couleur, ordre, masquage et suppression des colonnes,
  limite d'en-cours (WIP), statut appliqué automatiquement, champs affichés sur
  les cartes. La suppression d'une colonne déplace ses audits, jamais ne les perd.
- **Planning multi-échelles** : jour, semaine, mois, trimestre, année, **cycle
  pluriannuel** (3 ans par défaut), en fenêtre **alignée ou glissante**, avec
  **sélection d'audits**, filtres (catégorie, étiquette, pilote, auditeur,
  prestataire) et regroupement au choix. Le planifié et le réalisé sont
  superposés ; les phases non confirmées sont en pointillés.
- **Plan de charge** des auditeurs internes sur une période libre, avec alerte de
  surcharge, et suivi des jours consommés par société de prestation.

### Catégorisation
- **Catégorie** (axe principal, porte les templates, une couleur, une durée type),
- **étiquettes** transverses multiples,
- **champs personnalisés** (texte, nombre, date, oui/non, liste) définis en ligne.

Tous utilisables comme filtres dans les listes, le kanban, le planning et les
tableaux de bord.

### Tableaux de bord
Volumétrie (statut, catégorie, priorité, prestataire, pilote, étiquette),
activité dans le temps, **durées réelles vs planifiées**, écarts, taux de respect
des délais, distribution des durées, détail par audit et export CSV.

### Import en masse des TI
Import CSV/XLSX en quatre étapes : dépôt, correspondance automatique des
colonnes, **saisie des détails manquants** pour les catégories, sociétés, pilotes
et étiquettes absents de la base, puis contrôle (erreurs, avertissements,
doublons) et import. Les **colonnes qui n'existent pas encore en base** peuvent
être créées automatiquement comme champs personnalisés. Rien n'est écrit avant la
validation finale, et chaque lot conserve son rapport.

### Cadre
Templates de pré-requis et de phases par catégorie, documents techniques
sécurisés par audit, priorités et statuts configurables.

## Rôles

| Rôle | Droits |
|---|---|
| `admin` | Administration complète (utilisateurs, catégories, étiquettes, kanban, champs personnalisés, sociétés, templates) et tous les audits |
| `pilote_audit` | Crée/modifie les audits, phases, pré-requis, documents ; réalise les imports en masse |
| `responsable_service` | Consulte les audits, coche les pré-requis, suit le statut |

## Documentation

La documentation complète est dans **[`docs/`](docs/README.md)** :

| Document | Contenu |
|---|---|
| [guide-utilisateur.md](docs/guide-utilisateur.md) | Parcours quotidiens |
| [guide-administrateur.md](docs/guide-administrateur.md) | Kanban, catégories, étiquettes, champs, comptes |
| [import-en-masse.md](docs/import-en-masse.md) | Format de fichier, correspondances, doublons |
| [planning.md](docs/planning.md) | Échelles, vue glissante, cycles |
| [statistiques.md](docs/statistiques.md) | Indicateurs et définition des durées |
| [architecture.md](docs/architecture.md) · [modele-de-donnees.md](docs/modele-de-donnees.md) · [api.md](docs/api.md) | Technique |
| [exploitation.md](docs/exploitation.md) · [securite.md](docs/securite.md) | Déploiement, sauvegardes, sécurité |
| [deploiement-synology.md](docs/deploiement-synology.md) | Installation sur NAS Synology (DSM 7) |
| [dimensionnement.md](docs/dimensionnement.md) | **Mesures de charge et limites** |
| [developpement.md](docs/developpement.md) | Environnement local, tests, conventions |
| [presentation-equipe.pdf](docs/presentation-equipe.pdf) | Plaquette de présentation de l'application (captures commentées) |

L'essentiel est aussi accessible **dans l'application** (menu « Documentation »),
et la référence interactive de l'API sur `/api/docs`.

## Développement local (sans Docker)

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg2://audit:audit@localhost:5432/audit
export SECRET_KEY=dev-secret
uvicorn app.main:app --reload
python -m pytest tests -q      # suite de tests (SQLite, sans configuration)
```

### Frontend
```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # vérification TypeScript + build de production
```

## Dimensionnement

Mesuré sur une base PostgreSQL peuplée de **5 000 audits et 25 000 phases** :
listes, kanban, plan de charge, planning mensuel et tableaux de bord répondent
**en moins de 250 ms**. Les seuils et recommandations figurent dans
[docs/dimensionnement.md](docs/dimensionnement.md).

## Authentification SSO (optionnel)

Le modèle utilisateur prévoit `auth_provider` (`local`/`sso`) et les variables
`OIDC_*` pour brancher un fournisseur d'identité d'entreprise (Azure AD,
Keycloak…) sans remettre en cause le schéma de données. L'intégration complète du
flux OIDC reste à finaliser selon le fournisseur retenu.

## Sécurité

Mots de passe hachés (bcrypt), jetons JWT à durée limitée, contrôle de rôle sur
chaque point d'entrée, uploads assainis et limités en taille, stockage isolé par
audit. Avant mise en production, voir la liste de vérification de
[docs/securite.md](docs/securite.md).
