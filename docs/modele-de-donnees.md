# Modèle de données

Toutes les clés primaires sont des UUID (chaînes de 36 caractères).

## Schéma relationnel

```
users ──< audits >── categories ──< prerequisite_templates ──< prerequisite_template_items
  │        │  │  │                └─< phase_templates       ──< phase_template_items
  │        │  │  └──< audit_tags >── tags
  │        │  └─────< audit_custom_values >── custom_field_definitions
  │        ├─────────< audit_phases
  │        ├─────────< audit_prerequisites
  │        ├─────────< documents
  │        └───────── kanban_columns
  └── prestation_companies ──< audits

app_settings      (paramètres d'affichage)
import_batches    (lots d'import, traçabilité)
```

## Tables principales

### `audits`
| Colonne | Type | Rôle |
|---|---|---|
| `reference` | varchar(100), indexé | Identifiant TI d'origine ; clé de détection des doublons à l'import |
| `name` | varchar(255), indexé | Obligatoire |
| `category_id` | FK `categories`, indexé | Catégorie principale (un seul axe) |
| `priority`, `status` | enum | `status` est indexé ; couplé à la colonne kanban |
| `kanban_column_id` | FK `kanban_columns` (SET NULL) | Position sur le tableau |
| `pilot_id`, `service_owner_id` | FK `users` | |
| `prestation_company_id` | FK `prestation_companies` | |
| `planned_start`, `planned_end` | date, indexés | Dates prévues |
| `actual_start`, `actual_end` | date | **Dates réelles** — base des statistiques de durée |
| `estimated_days` | numeric(6,2) | Charge estimée |
| `import_batch_id` | varchar(36), indexé | Lot d'import d'origine (traçabilité) |

Index composite : `ix_audits_status_planned_start (status, planned_start)`.

### `audit_phases`
Étapes datées : `start_date`/`end_date` (prévu, indexés), `actual_start_date`/
`actual_end_date` (réel), `status`, `confirmed`, `auditor_id` ou
`auditor_external_name`. Index composite `ix_audit_phases_dates`.

### `kanban_columns`
Colonnes du tableau, pilotées par l'administration : `key` (unique), `label`,
`description`, `color`, `position`, `wip_limit`, `mapped_status` (statut appliqué
aux cartes déposées, facultatif), `is_default`, `is_final`, `is_active`.

Suppression d'une colonne : les audits qu'elle contient sont **réaffectés** à une
autre colonne (choisie, ou colonne par défaut) avant suppression — aucun audit
n'est perdu ni orphelin.

### `tags` et `audit_tags`
Étiquetage transverse multiple. `audit_tags` est une table d'association avec
suppression en cascade des deux côtés.

### `custom_field_definitions` et `audit_custom_values`
Champs additionnels définis en ligne ou créés automatiquement par un import.
- Définition : `entity` (`audit`), `key` (unique par entité), `label`,
  `field_type` (`texte`, `texte_long`, `nombre`, `date`, `booleen`, `liste`),
  `options`, `is_required`, `show_in_list`, `is_active`, `created_from_import`.
- Valeur : `(audit_id, field_id)` unique, valeur stockée en texte.

Désactiver un champ (`is_active = false`) le masque **sans perdre** les valeurs
saisies ; la suppression définitive (`purge_values=true`) est explicite.

### `import_batches`
Un lot par fichier déposé : colonnes source, lignes normalisées, mapping,
décisions de l'analyste (`resolutions`), options et rapport d'import. Permet de
reprendre un import interrompu et de tracer l'origine des audits créés.

### `app_settings`
Paramètres d'affichage au format JSON, clé par domaine (`kanban`, `planning`).

## Migrations

Au démarrage, `app/migrations.py` :
1. ajoute les colonnes manquantes des tables existantes (`ALTER TABLE ... ADD COLUMN`) ;
2. crée les tables absentes (`create_all`) ;
3. crée les index manquants (`checkfirst=True`) ;
4. installe les données de référence : colonnes kanban par défaut (reprenant le
   cycle de vie historique) et paramètres d'affichage ;
5. rattache à une colonne kanban les audits qui n'en ont pas.

Toutes ces étapes sont **idempotentes** : un redémarrage ne produit aucun effet
de bord. Les données existantes sont conservées ; une base déjà en service migre
sans intervention.

> Ce mécanisme couvre les évolutions **additives**. Un renommage ou une
> suppression de colonne nécessiterait un script dédié.
