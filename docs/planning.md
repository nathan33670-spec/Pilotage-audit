# Planning multi-échelles

**Planification → Planning (échelles)**.

## Échelles

| Échelle | Fenêtre par défaut | Usage |
|---|---|---|
| **Jour** | 14 jours | Coordination de la semaine, affectation fine des auditeurs |
| **Semaine** | 12 semaines | Trimestre glissant |
| **Mois** | 12 mois | Plan annuel |
| **Trimestre** | 8 trimestres | Vision à deux ans |
| **Année** | 3 ans | Trajectoire pluriannuelle |
| **Cycle** | 1 cycle de 3 ans (paramétrable) | Couverture d'un cycle d'audit complet |

Le champ **nombre de périodes** ajuste la largeur de la fenêtre (par exemple
30 jours, 6 mois, 5 ans). Le nombre d'années par cycle est réglable (3 par défaut).

## Vue glissante ou alignée

- **Alignée** (défaut) : la fenêtre commence au début de la période contenant la
  date d'ancrage — 1er du mois, du trimestre, de l'année, ou première année du
  cycle (les cycles sont alignés sur les multiples du nombre d'années : 2025-2027
  pour un cycle de 3 ans).
- **Glissante** : la fenêtre démarre exactement à la date d'ancrage. Utile pour
  un « 12 mois à venir » à partir d'aujourd'hui.

Les flèches déplacent la fenêtre d'une période, le bouton du milieu revient à
aujourd'hui.

## Sélection et filtres

- **Sélection d'audits** : liste à choix multiples, pour se limiter à un
  sous-ensemble précis (par exemple les TI d'un même programme).
- **Filtres** : catégorie, étiquette, pilote, auditeur, société de prestation.
  Ils se combinent avec la sélection.
- **Regroupement des lignes** : par audit, catégorie, pilote, société de
  prestation ou auditeur.

## Lecture du planning

| Élément | Signification |
|---|---|
| Barre pleine | Période **planifiée** |
| Barre hachurée (sous la barre pleine) | Période **réalisée** |
| Contour plein | Phase confirmée |
| Contour pointillé, barre atténuée | Phase non confirmée |
| Couleur | Priorité de l'audit |

Un clic sur une barre ouvre la fiche de l'audit ; le survol affiche le détail
(audit, phase, auditeur, dates, confirmation).

## Détail des phases

La case **Phases** affiche le détail des phases. Elle est **décochée
automatiquement aux échelles Année et Cycle**, où le détail est illisible et
alourdit fortement la réponse (voir [dimensionnement.md](dimensionnement.md)) ;
elle reste réactivable manuellement.

## Volumétrie affichée

Le planning affiche au maximum **150 lignes** ; au-delà, un bandeau indique le
nombre total de lignes correspondant à la fenêtre et invite à filtrer, à changer
de regroupement ou à réduire la fenêtre. Le calcul, lui, porte sur l'ensemble des
audits retenus.

## API sous-jacente

- `GET /api/planning/range?scale=&anchor=&span=&rolling=&cycle_years=` — bornes
  et en-têtes de colonnes de la fenêtre ;
- `GET /api/planning/audits?...&include_phases=` — audits projetés sur la fenêtre,
  avec leurs phases.

Le filtrage temporel est réalisé en base : seuls les audits chevauchant la
fenêtre (par leurs dates prévues, réelles, ou celles d'une phase) sont chargés.
