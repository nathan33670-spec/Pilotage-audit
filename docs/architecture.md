# Architecture

## Vue d'ensemble

```
        Navigateur
            │  HTTPS
            ▼
   ┌──────────────────┐        ┌──────────────────┐        ┌───────────────┐
   │ frontend (nginx) │ /api/* │ backend (FastAPI)│        │ PostgreSQL 16 │
   │ React + MUI      │───────▶│ SQLAlchemy 2     │───────▶│   base audit  │
   │ build statique   │        │ JWT              │        └───────────────┘
   └──────────────────┘        └────────┬─────────┘
                                        │ volume uploads_data
                                        ▼
                                  documents d'audit
```

Trois conteneurs Docker Compose : `db`, `backend`, `frontend`. Le frontend sert
les fichiers statiques et **relaie `/api/` vers le backend** (voir
`frontend/nginx.conf`) : le navigateur ne dialogue qu'avec une seule origine.

## Backend (`backend/app`)

| Fichier | Rôle |
|---|---|
| `main.py` | Création de l'application, montage des routeurs, démarrage (migrations + compte admin initial) |
| `config.py` | Configuration par variables d'environnement (pydantic-settings) |
| `database.py` | Moteur SQLAlchemy, session, classe de base |
| `models.py` | Modèle de données (voir [modele-de-donnees.md](modele-de-donnees.md)) |
| `schemas.py` | Schémas Pydantic d'entrée/sortie |
| `security.py` | Hachage des mots de passe (bcrypt), jetons JWT |
| `deps.py` | Dépendances FastAPI : utilisateur courant, contrôle de rôle |
| `migrations.py` | Migrations légères idempotentes + données de référence |
| `importer.py` | Moteur d'import : lecture de fichier, normalisation, rapprochements |
| `routers/` | Points d'entrée HTTP par domaine |

### Routeurs

`auth`, `users`, `categories`, `tags`, `templates`, `phase_templates`,
`prestations`, `audits`, `planning`, `documents`, `kanban`, `settings`,
`custom-fields`, `stats`, `imports`.

## Frontend (`frontend/src`)

| Dossier | Rôle |
|---|---|
| `pages/` | Écrans : planification, audits, détail d'audit, statistiques, import, administration, documentation |
| `components/` | Kanban, planning multi-échelles, plan de charge, graphiques SVG |
| `components/charts/` | Bibliothèque de graphiques maison (aucune dépendance de visualisation) |
| `api/client.ts` | Client axios, injection du jeton, redirection sur 401 |
| `auth/` | Contexte d'authentification |
| `types.ts` | Types partagés, alignés sur les schémas de l'API |

## Choix structurants

- **Pas d'ORM côté statistiques** : les tableaux de bord lisent des projections
  agrégées en SQL, pas des objets complets (voir [dimensionnement.md](dimensionnement.md)).
- **Configuration en base plutôt que dans le code** : colonnes du kanban,
  catégories, étiquettes, champs personnalisés et options d'affichage sont des
  données, modifiables en ligne par un administrateur.
- **Aucun stockage de résultat d'audit ni de vulnérabilité** : périmètre
  volontairement limité au pilotage.
- **Migrations sans Alembic** : le schéma est créé par `create_all()` et
  complété au démarrage par `migrations.py`, qui ajoute de façon idempotente les
  colonnes et index manquants. Ce choix garde le déploiement à une seule
  commande ; il suppose que les évolutions de schéma restent additives.
- **Import en deux temps** : l'analyse n'écrit rien en base ; seules les
  décisions validées par l'analyste déclenchent des créations.
