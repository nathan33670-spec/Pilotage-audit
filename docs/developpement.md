# Développement

## Environnement local

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg2://audit:audit@localhost:5432/audit
export SECRET_KEY=dev-secret
uvicorn app.main:app --reload
```

L'API écoute sur <http://localhost:8000>, la documentation interactive sur
<http://localhost:8000/api/docs>.

### Frontend

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

Le serveur de développement relaie `/api` vers `http://localhost:8000`
(configurable par la variable `VITE_API_TARGET`) : aucun réglage supplémentaire
n'est nécessaire tant que le backend tourne localement.

## Tests

```bash
cd backend
python -m pytest tests -q
```

La suite s'exécute sur SQLite (base temporaire, aucune configuration requise) et
couvre le kanban configurable, la catégorisation, l'import en masse de bout en
bout, les statistiques de durées réelles et les échelles de planning.

```bash
cd frontend
npm run lint      # ESLint
npm run build     # tsc -b + build de production
```

## Conventions

- **Code et commentaires en français**, comme le reste du projet ; les
  identifiants restent en anglais (`planned_start`, `kanban_column_id`…).
- Les libellés destinés aux utilisateurs sont en français, accentués.
- Les schémas Pydantic sont la source de vérité : `frontend/src/types.ts` doit
  rester aligné.
- Pas de dépendance de visualisation côté frontend : les graphiques sont écrits
  en SVG dans `components/charts/Charts.tsx`.

## Ajouter un champ à l'audit

1. Colonne dans `models.py`.
2. Entrée dans `ADDED_COLUMNS` de `migrations.py` (pour les bases existantes).
3. Champs correspondants dans `schemas.py` (`AuditBase`, `AuditUpdate`).
4. Type dans `frontend/src/types.ts`, puis usage dans les écrans.
5. Si le champ doit être importable, l'ajouter à `TARGET_FIELDS` et aux
   `HEADER_SYNONYMS` de `importer.py`.

> Si le besoin est propre à une organisation, préférez un **champ personnalisé**
> (créable en ligne) à une évolution du schéma.

## Ajouter une colonne de kanban

Aucune évolution de code : la configuration se fait dans l'application
(Administration → Kanban). Les valeurs par défaut installées sur une base neuve
sont définies dans `DEFAULT_KANBAN_COLUMNS` (`migrations.py`).

## Performance

Avant d'ajouter un endpoint de synthèse, lire
[dimensionnement.md](dimensionnement.md) : les agrégations se font en SQL, pas en
chargeant des objets ORM. Un endpoint qui renvoie plus de 2 Mo doit proposer une
option de réduction (filtres, `include_*`).
