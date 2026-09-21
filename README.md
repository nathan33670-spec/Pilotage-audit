# Pilotage Audit

Application de suivi et de planification des audits internes/externes : phases d'audit, plans de charge des pilotes/auditeurs, suivi des prestataires, pré-requis par catégorie, documents techniques. **Ne stocke pas les résultats d'audit ni les vulnérabilités** (hors périmètre par choix).

## Stack technique

- **Backend** : Python / FastAPI / SQLAlchemy / PostgreSQL, authentification JWT locale (+ point d'extension SSO/OIDC)
- **Frontend** : React + TypeScript + Vite + MUI (Material UI)
- **Déploiement** : Docker Compose (3 services : `db`, `backend`, `frontend`), multi-plateforme (Windows/macOS/Linux)

## Démarrage rapide (Docker)

1. Copier le fichier d'environnement et renseigner des valeurs (mots de passe, `SECRET_KEY`) :
   ```bash
   cp .env.example .env
   ```
2. Construire et lancer les conteneurs :
   ```bash
   docker compose up --build -d
   ```
3. Ouvrir [http://localhost:8080](http://localhost:8080).
4. Se connecter avec le compte administrateur créé automatiquement au premier démarrage (`ADMIN_EMAIL` / `ADMIN_PASSWORD` définis dans `.env`), puis **changer immédiatement son mot de passe** et créer les comptes des pilotes d'audit / responsables de service.

Les fichiers/documents uploadés sont conservés dans le volume Docker nommé `uploads_data` (persistant entre redémarrages).

## Rôles

| Rôle | Droits |
|---|---|
| `admin` | Gestion complète (utilisateurs, catégories, templates, sociétés de prestation, tous les audits) |
| `pilote_audit` | Crée/modifie les audits, phases, pré-requis, documents |
| `responsable_service` | Consulte les audits de son périmètre, peut cocher les pré-requis, suit le statut |

## Fonctionnalités principales

- **Planification graphique** : vue mensuelle type Gantt des phases d'audit, code couleur par priorité, distinction visuelle confirmé (trait plein) / non confirmé (pointillés).
- **Plan de charge auditeurs** : calcul automatique de la charge assignée par auditeur sur une période.
- **Suivi des sociétés de prestation** : jours alloués vs jours consommés (déduits des phases assignées).
- **Templates de pré-requis par catégorie d'audit**, appliqués automatiquement à la création d'un audit.
- **Documents/fichiers techniques** attachés à chaque audit (upload/téléchargement sécurisé).
- **Priorité et statut** configurables sur chaque audit et chaque phase.

## Développement local (sans Docker)

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg2://audit:audit@localhost:5432/audit
export SECRET_KEY=dev-secret
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Le serveur de dev Vite tourne sur `http://localhost:5173` ; configurez un proxy ou pointez directement vers `http://localhost:8000` pour l'API en développement.

## Authentification SSO (optionnel)

Le modèle utilisateur prévoit un champ `auth_provider` (`local`/`sso`) et les variables `OIDC_*` dans `.env` pour brancher un fournisseur d'identité d'entreprise (Azure AD, Keycloak, etc.) sans remettre en cause le schéma de données. L'intégration complète du flux OIDC est à finaliser selon le fournisseur choisi.

## Sécurité

- Mots de passe hachés (bcrypt), jetons JWT à durée limitée.
- Uploads : noms de fichiers assainis, taille maximale contrôlée, stockage isolé par audit.
- Pensez à changer `SECRET_KEY` et les mots de passe par défaut avant toute mise en production.
