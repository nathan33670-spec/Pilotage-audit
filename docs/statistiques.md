# Tableaux de bord

Menu **Tableaux de bord**.

## Définition des durées

Toutes les durées sont exprimées en **jours calendaires, bornes incluses**
(un audit du 2 au 6 mars dure 5 jours).

| Durée | Source |
|---|---|
| **Planifiée** | `planned_start` / `planned_end` de l'audit ; à défaut, enveloppe (min/max) des dates prévues de ses phases |
| **Réelle** | `actual_start` / `actual_end` de l'audit ; à défaut, enveloppe des dates réelles de ses phases |
| **Écart** | Durée réelle − durée planifiée. Positif = dépassement |

Un audit sans dates réelles **ne compte pas** dans les moyennes de durée réelle,
ni dans le taux « dans les délais ». La qualité de ces indicateurs dépend donc
directement de la saisie des dates réelles à la clôture.

## Sélection de la période

Raccourcis (année en cours, 12 derniers mois, cycle de 3 ans, tout l'historique)
ou dates libres. Un audit est retenu s'il **chevauche** la période, sur ses dates
réelles si elles existent, sinon sur ses dates planifiées.

Filtres combinables : catégorie, étiquette, pilote, prestataire.

## Indicateurs de tête

| Indicateur | Calcul |
|---|---|
| Audits (période) | Nombre d'audits retenus / nombre total en base |
| Terminés / en cours | Comptage par statut |
| Durée réelle moyenne | Moyenne et médiane des durées réelles |
| Écart au planning | Moyenne des écarts (réel − planifié) |
| Dans les délais | Part des audits comparables dont la durée réelle ≤ durée planifiée |
| Charge réelle cumulée | Somme des durées réelles, comparée à la somme planifiée |

Le nombre d'audits **en retard** (fin prévue dépassée, audit non terminé ni
annulé) et **non planifiés** (aucune date) est également remonté.

## Onglet « Synthèse »

- **Activité dans le temps** : audits démarrés, terminés et encours en fin de
  période, à la granularité choisie (jour, semaine, mois, trimestre, année).
- **Répartitions** : par statut, catégorie, priorité, prestataire, pilote,
  étiquette.

## Onglet « Temps réels »

- **Durée planifiée vs réelle** par axe d'analyse : catégorie, priorité,
  prestataire, pilote ou **type de phase** (comparer par exemple la durée des
  phases « Cadrage » entre audits) ;
- **distribution** des durées réelles par tranche (≤ 2 j, 3–5 j, 6–10 j,
  11–20 j, > 20 j) ;
- **tableau** reprenant les mêmes données : nombre d'audits, moyennes, médiane,
  min/max, écart moyen, taux de respect des délais.

## Onglet « Détail par audit »

Une ligne par audit : périodes planifiée et réelle, durées, écart. Le bouton
**Exporter (CSV)** produit ce tableau au format `;` avec BOM UTF-8, directement
exploitable dans Excel.

## Lisibilité des graphiques

Les graphiques sont produits en SVG sans dépendance externe. La palette
catégorielle est fixe (jamais recyclée) et validée pour les déficiences de vision
des couleurs ; chaque valeur est **également écrite en clair** et reprise dans une
vue tableau, de sorte qu'aucune information ne repose sur la seule couleur. Les
graphiques n'utilisent jamais deux échelles verticales.

## API sous-jacente

| Endpoint | Contenu |
|---|---|
| `GET /api/stats/overview` | Indicateurs de tête et répartitions |
| `GET /api/stats/durations` | Durées par axe d'analyse et distribution |
| `GET /api/stats/timeseries` | Série temporelle (granularité paramétrable) |
| `GET /api/stats/audits` | Détail audit par audit |

Tous acceptent les filtres `start`, `end`, `category_id`, `pilot_id`,
`prestation_company_id`, `tag_id`, `status`, `audit_ids`.
