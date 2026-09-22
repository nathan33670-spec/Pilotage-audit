# Référence de l'API

Base : `/api`. Toutes les routes, hors `POST /api/auth/login` et
`GET /api/health`, exigent un jeton : `Authorization: Bearer <jeton>`.

Documentation interactive (schémas complets, essai en direct) : **`/api/docs`**.

## Authentification

| Méthode | Chemin | Rôle | Description |
|---|---|---|---|
| POST | `/auth/login` | — | Formulaire `username` (e-mail) + `password`, renvoie un jeton |
| GET | `/auth/me` | authentifié | Profil courant |
| GET | `/auth/sso/status` | authentifié | Indique si le SSO est configuré |

## Audits

| Méthode | Chemin | Rôle | Description |
|---|---|---|---|
| GET | `/audits` | authentifié | Liste. Filtres : `status`, `priority`, `pilot_id`, `category_id`, `prestation_company_id`, `kanban_column_id`, `tag_id` (répétable), `q`, `start`, `end`, `limit` (≤ 2000), `offset` |
| POST | `/audits` | pilote/admin | Création (`tag_ids`, `custom_fields`, `apply_template_id`, `apply_phase_template_id`) |
| GET | `/audits/{id}` | authentifié | Détail (phases, pré-requis, documents) |
| PATCH | `/audits/{id}` | pilote/admin | Modification partielle, y compris `tag_ids` et `custom_fields` |
| DELETE | `/audits/{id}` | pilote/admin | Suppression |
| POST | `/audits/{id}/kanban-column` | pilote/admin | Déplace la carte (`{"column_id": "…"}`) |
| POST | `/audits/{id}/apply-phase-template/{template_id}` | pilote/admin | Ajoute les phases d'un template |
| POST/PATCH/DELETE | `/audits/{id}/phases[/{phase_id}]` | pilote/admin | Phases |
| POST/PATCH/DELETE | `/audits/{id}/prerequisites[/{prereq_id}]` | PATCH : authentifié | Pré-requis (le cochage est ouvert à tous les utilisateurs authentifiés) |
| GET/POST/DELETE | `/audits/{id}/documents[/{doc_id}]` | POST/DELETE : pilote/admin | Documents ; téléchargement sur `/documents/{doc_id}/download` |

## Planning

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/planning/range` | Fenêtre et colonnes : `scale` (`jour`…`cycle`), `anchor`, `span`, `rolling`, `cycle_years` |
| GET | `/planning/audits` | Audits projetés sur la fenêtre ; mêmes paramètres + `audit_ids`, `category_id`, `tag_id`, `pilot_id`, `prestation_company_id`, `auditor_id`, `status`, `include_phases`, `include_undated` |
| GET | `/planning/phases` | Phases brutes (vue historique) |
| GET | `/planning/workload` | Plan de charge par auditeur : `start`, `end` |

## Statistiques

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/stats/overview` | Indicateurs de tête et répartitions |
| GET | `/stats/durations` | Durées planifiées/réelles par axe, distribution |
| GET | `/stats/timeseries` | Série temporelle (`granularity` : `jour`, `semaine`, `mois`, `trimestre`, `annee`) |
| GET | `/stats/audits` | Détail audit par audit |

Filtres communs : `start`, `end`, `category_id`, `pilot_id`,
`prestation_company_id`, `tag_id`, `status`, `audit_ids`.

## Import en masse

| Méthode | Chemin | Rôle | Description |
|---|---|---|---|
| GET | `/imports/template.csv` | authentifié | Modèle de fichier |
| GET | `/imports` | pilote/admin | 50 derniers lots |
| POST | `/imports` | pilote/admin | Dépôt d'un fichier (`multipart/form-data`), renvoie l'analyse |
| GET | `/imports/{id}` | pilote/admin | Analyse à jour d'un lot |
| PATCH | `/imports/{id}` | pilote/admin | Enregistre `mapping`, `entities`, `new_fields`, `options` |
| POST | `/imports/{id}/commit` | pilote/admin | Exécute l'import, renvoie le rapport |
| DELETE | `/imports/{id}` | pilote/admin | Supprime le lot |

## Administration

| Méthode | Chemin | Rôle | Description |
|---|---|---|---|
| GET | `/kanban/columns` | authentifié | Colonnes (+ `include_inactive`) et compteurs |
| POST/PATCH/DELETE | `/kanban/columns[/{id}]` | admin | Gestion des colonnes ; `DELETE` accepte `move_audits_to` |
| POST | `/kanban/columns/reorder` | admin | `{"column_ids": [...]}` |
| GET | `/settings` · `/settings/{key}` | authentifié | Paramètres d'affichage |
| PUT | `/settings/{key}` | admin | Fusionne les clés fournies |
| GET/POST/PATCH/DELETE | `/custom-fields[/{id}]` | écriture : admin | Champs personnalisés (`purge_values` sur `DELETE`) |
| GET/POST/PATCH/DELETE | `/tags[/{id}]` | écriture : admin | Étiquettes |
| GET/POST/PATCH/DELETE | `/categories[/{id}]` | écriture : admin | Catégories |
| GET/POST/PATCH/DELETE | `/users[/{id}]` | écriture : admin | Utilisateurs (`DELETE` = désactivation) |
| GET/POST/DELETE | `/templates`, `/phase-templates` | écriture : admin | Templates |
| GET/POST/PATCH/DELETE | `/prestation-companies[/{id}]` | écriture : admin | Sociétés ; consommation sur `/{id}/consumption` |

## Service

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/health` | État et version |
| GET | `/version` | Nom, version, environnement |

## Codes d'erreur

| Code | Signification |
|---|---|
| 400 | Requête invalide (doublon de clé, catégorie utilisée, fichier illisible…) |
| 401 | Jeton absent, invalide ou expiré |
| 403 | Rôle insuffisant, ou compte désactivé |
| 404 | Ressource inexistante |
| 413 | Fichier trop volumineux |
| 422 | Corps de requête non conforme au schéma |
