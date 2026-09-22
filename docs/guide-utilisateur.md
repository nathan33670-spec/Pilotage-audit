# Guide utilisateur

## Rôles

| Rôle | Droits |
|---|---|
| `admin` | Administration complète, tous les audits |
| `pilote_audit` | Crée et modifie audits, phases, pré-requis, documents ; réalise les imports |
| `responsable_service` | Consulte, coche les pré-requis, suit l'avancement |

## Créer un audit

**Audits → Nouvel audit**. Champs utiles dès la création :

- **Nom** (obligatoire) et **référence / identifiant TI** (recommandé : sert de
  clé de rapprochement lors des imports) ;
- **catégorie** et **étiquettes** (voir ci-dessous) ;
- **priorité**, **pilote**, **responsable de service**, **société de prestation** ;
- **templates** de pré-requis et de phases : appliqués immédiatement, les phases
  étant datées en cascade à partir du début prévu.

## Catégoriser

Trois niveaux complémentaires :

1. **Catégorie** — un seul axe principal par audit (type de TI). Elle porte les
   templates, une couleur, un code et une durée type. Créée par un administrateur.
2. **Étiquettes** — plusieurs par audit : exigence réglementaire, périmètre,
   entité, exposition… Utilisables comme filtre partout dans l'application.
3. **Champs personnalisés** — données propres à l'organisation (application
   concernée, numéro de lot, contrat…). Ceux marqués « afficher dans la liste »
   apparaissent en colonne dans la liste des audits.

## Suivre l'avancement — kanban

**Planification → Kanban**. Les cartes se déplacent par glisser-déposer, ou via
le sélecteur au bas de chaque carte (alternative accessible). Déplacer une carte
applique automatiquement le statut associé à la colonne, si elle en définit un.

Filtres disponibles : recherche libre (nom, référence), catégorie, étiquette,
pilote. Une colonne dont la limite d'en-cours est dépassée est signalée en rouge.

Sur un portefeuille volumineux, le tableau charge au maximum 1 000 cartes : les
compteurs de colonnes affichent alors « cartes affichées / total réel » et un
bandeau invite à filtrer.

## Planifier

**Planification → Planning (échelles)** : voir [planning.md](planning.md).

**Planification → Plan de charge** : jours assignés par auditeur interne sur une
période, avec alerte de surcharge.

## Phases

Sur la fiche d'un audit :

- ajouter des phases une par une ou appliquer un **template de phases** ;
- renseigner les **dates prévues** puis, à la réalisation, les **dates réelles** ;
- **confirmer** une phase (trait plein dans le planning, pointillés sinon) ;
- affecter un **auditeur interne** ou saisir un **auditeur externe**.

## Pré-requis et documents

Les pré-requis issus du template de la catégorie sont créés automatiquement.
Le responsable de service peut les cocher : la date et l'auteur de la validation
sont conservés. Les documents techniques sont attachés à l'audit (stockage isolé
par audit, noms de fichiers assainis).

## Clôturer un audit

1. Passer les phases en `terminé` et renseigner leurs dates réelles.
2. Renseigner les **dates réelles de l'audit** (ou les laisser se déduire des
   phases).
3. Déplacer la carte dans la colonne finale du kanban.

C'est cette saisie qui alimente les statistiques de temps réels.
