# Dimensionnement

Ce document répond à la question « l'application est-elle correctement
dimensionnée ? » par des **mesures**, et indique les seuils au-delà desquels des
évolutions deviennent nécessaires.

## 1. Volumétrie cible

Hypothèses d'un service d'audit interne gérant un portefeuille de tests
d'intrusion :

| Objet | Hypothèse haute retenue |
|---|---|
| Audits / TI (historique complet, 3 cycles) | 5 000 |
| Phases | 25 000 (5 par audit) |
| Pré-requis | 30 000 (6 par audit) |
| Utilisateurs déclarés | 40 |
| Utilisateurs simultanés | 10 à 20 |
| Catégories / étiquettes | quelques dizaines |
| Documents joints | quelques milliers, quelques Mo chacun |

## 2. Protocole de mesure

- PostgreSQL 16.13, base réellement peuplée au volume ci-dessus par un script de
  génération (`5 000` audits, `25 000` phases, `30 000` pré-requis, 40 comptes,
  12 catégories, 25 étiquettes, 8 prestataires), dates réparties sur 2022–2026,
  60 % des audits clôturés avec dates réelles.
- Backend exécuté en local (conteneur 4 vCPU, 16 Go), appels via le client de
  test HTTP de l'application (le réseau n'est donc pas mesuré, la base l'est).
- 5 exécutions par appel, **médiane et maximum** relevés.
- Taille de la base obtenue : **30 Mo** pour 6 950 audits et 25 000 phases, soit
  de l'ordre de **4 à 5 Ko par audit**, index compris.

## 3. Résultats

| Appel | Médiane | Max | Réponse |
|---|---|---|---|
| Liste des audits (500, filtres) | 59 ms | 118 ms | 470 Ko |
| Liste des audits (2 000) | 251 ms | 269 ms | 1,8 Mo |
| Recherche plein texte | 17 ms | 21 ms | — |
| Colonnes kanban + compteurs | 7 ms | 8 ms | — |
| Statistiques — synthèse (1 an) | 176 ms | 187 ms | 9 Ko |
| Statistiques — synthèse (historique complet) | 197 ms | 203 ms | 9 Ko |
| Statistiques — durées (1 an) | 175 ms | 190 ms | 17 Ko |
| Statistiques — série temporelle mensuelle (3 ans) | 169 ms | 174 ms | — |
| Planning — mois | 97 ms | 225 ms | 359 Ko |
| Planning — année | 551 ms | 574 ms | 3,7 Mo |
| Planning — cycle 3 ans, **sans** détail des phases | 410 ms | 490 ms | 2,0 Mo |
| Planning — cycle 3 ans, **avec** détail des phases | 1 725 ms | 1 813 ms | 11 Mo |
| Plan de charge auditeurs (1 mois) | 20 ms | 25 ms | — |
| Import — analyse de 1 000 lignes | 1 786 ms | — | — |
| Import — création de 1 000 audits | 4 516 ms | — | — |

**Conclusion : l'application est correctement dimensionnée pour la volumétrie
cible.** Tous les écrans du quotidien (listes, kanban, plan de charge, planning
mensuel, tableaux de bord) répondent en dessous de 250 ms sur un historique de
5 000 audits. Les deux seuls appels au-delà de la seconde sont volontairement
lourds et documentés ci-dessous.

## 4. Optimisations mises en œuvre

Les mesures initiales (avant optimisation) donnaient 2,2 s pour les tableaux de
bord et 1,7 à 2,2 s pour le planning. Trois changements ont ramené ces temps
dans les ordres de grandeur ci-dessus :

1. **Statistiques : projection agrégée au lieu d'objets ORM.** Les durées, les
   bornes de phases et l'avancement des pré-requis sont calculés par des
   sous-requêtes `GROUP BY` ; les endpoints ne chargent plus 55 000 objets par
   appel. Gain mesuré : **× 12** (2 200 ms → 180 ms).
2. **Planning : fenêtre temporelle appliquée en base.** Le filtre de chevauchement
   (dates prévues, réelles ou de phase) est poussé en SQL, et les phases ne sont
   chargées que si elles sont demandées. Gain mesuré sur le planning mensuel :
   **× 17** (1 672 ms → 97 ms).
3. **Index ciblés** : `audits(status)`, `audits(category_id)`,
   `audits(planned_start)`, `audits(planned_end)`, `audits(reference)`,
   `audits(kanban_column_id)`, `audit_phases(audit_id)`,
   `audit_phases(start_date, end_date)`, plus l'index composite
   `(status, planned_start)`. Ils sont créés au démarrage, y compris sur une base
   existante.

Côté frontend, le bundle est découpé (`react`, `mui`, application) : 55 Ko gzip
de code applicatif, le reste étant mis en cache par le navigateur entre deux
livraisons.

## 5. Points d'attention et seuils

| Sujet | Seuil | Recommandation |
|---|---|---|
| **Planning « cycle 3 ans » avec phases** | > 1 500 audits dans la fenêtre | Le détail des phases est désactivé par défaut aux échelles Année et Cycle. Le réactiver sur un cycle complet génère une réponse de plusieurs Mo : filtrer par catégorie, pilote ou sélection d'audits. |
| **Import en masse** | 5 000 lignes par lot (limite dure) | Traitement synchrone : ~4,5 s pour 1 000 lignes, ~25 s pour 5 000. Découper les fichiers plus volumineux. Au-delà d'un usage régulier à ce volume, basculer l'import en tâche de fond. |
| **Liste des audits** | `limit` par défaut 500, maximum 2 000 | Au-delà de ~2 000 audits affichés d'un coup, passer à une pagination côté serveur (`offset` est déjà disponible). |
| **Kanban** | 1 000 cartes chargées | Au-delà, un bandeau signale la troncature et les compteurs de colonnes affichent `affichées / total réel`. Le tableau reste utilisable en filtrant. |
| **Planning** | 150 lignes affichées | Au-delà, un bandeau invite à filtrer ou à changer de regroupement : rendre plusieurs milliers de lignes de Gantt sature le navigateur, pas le serveur. |
| **Pool de connexions** | 5 connexions + 10 en débordement (défaut SQLAlchemy) | Suffisant pour 20 utilisateurs simultanés. Au-delà de ~50, augmenter `pool_size` et dimensionner `max_connections` côté PostgreSQL. |
| **Documents** | `MAX_UPLOAD_SIZE_MB` = 50 Mo par fichier | Les fichiers sont lus en mémoire avant écriture : un import simultané de gros fichiers consomme d'autant de RAM. Réduire la limite si la mémoire du conteneur est contrainte. |
| **Volume de base** | ~5 Ko par audit | 50 000 audits ≈ 250 Mo : sans difficulté pour PostgreSQL, mais les vues « tout l'historique » devront être bornées par défaut. |
| **Sauvegarde** | — | Volumes `db_data` et `uploads_data` (voir [exploitation.md](exploitation.md)). |

## 6. Ressources conseillées

| Composant | CPU | RAM | Disque |
|---|---|---|---|
| `db` (PostgreSQL) | 1 vCPU | 1 Go | 10 Go + croissance des documents |
| `backend` | 1 vCPU | 512 Mo à 1 Go | — |
| `frontend` (nginx) | 0,25 vCPU | 128 Mo | — |

Un seul hôte de 2 vCPU / 4 Go couvre la volumétrie cible. Le backend est sans
état (hors volume de documents) : il peut être répliqué derrière un répartiteur
de charge si le nombre d'utilisateurs simultanés augmente, à condition de
partager le volume des documents.

## 7. Rejouer les mesures

Le script de génération et de mesure n'est pas versionné (données synthétiques) ;
la procédure est reproductible en quelques lignes :

```bash
cd backend
pip install -r requirements-dev.txt
export DATABASE_URL=postgresql+psycopg2://audit:audit@localhost:5432/audit
python -m pytest tests -q          # non-régression fonctionnelle
# puis peupler la base et chronométrer les endpoints listés ci-dessus
```
