# Import en masse des TI

Menu **Import en masse** (rôles `admin` et `pilote_audit`).

L'import se déroule en quatre étapes. **Aucune écriture en base n'a lieu avant la
validation finale** : l'analyse et les décisions sont conservées dans un lot
d'import (`import_batches`), que l'on peut reprendre plus tard.

## Étape 1 — Fichier

| Contrainte | Valeur |
|---|---|
| Formats | CSV, TSV, TXT, XLSX/XLSM |
| Séparateur CSV | détecté automatiquement (`;`, `,`, tabulation, `|`) |
| Encodage CSV | UTF-8 (avec ou sans BOM), Windows-1252, Latin-1 |
| En-têtes | première ligne non vide du fichier |
| Volume | 5 000 lignes maximum par lot ; taille de fichier limitée par `MAX_UPLOAD_SIZE_MB` (50 Mo par défaut) |

Un modèle est téléchargeable depuis la page (`GET /api/imports/template.csv`).

## Étape 2 — Correspondance des colonnes

Chaque intitulé est rapproché d'un champ de l'application par dictionnaire de
synonymes puis par similarité (seuil 0,86). Le rapprochement est **toujours
modifiable**.

### Champs cibles reconnus

| Champ | Clé | Remarques |
|---|---|---|
| Référence / identifiant TI | `reference` | Clé de détection des doublons |
| Nom de l'audit | `name` | **Obligatoire** — une ligne sans nom est rejetée |
| Description | `description` | |
| Catégorie | `category` | Créable pendant l'import |
| Étiquettes | `tags` | Valeurs multiples séparées par `;` `,` `/` `|` |
| Priorité | `priority` | `basse`, `moyenne`, `haute`, `critique` + synonymes (`P1`…`P4`, `low`, `high`, `critical`…) |
| Statut | `status` | `brouillon`, `planifié`, `en cours`, `en attente`, `bloqué`, `terminé`, `annulé` + synonymes |
| Pilote d'audit | `pilot` | Créable pendant l'import |
| Responsable de service | `service_owner` | Créable pendant l'import |
| Société de prestation | `prestation_company` | Créable pendant l'import |
| Début / fin prévus | `planned_start`, `planned_end` | |
| Début / fin réels | `actual_start`, `actual_end` | Alimente les statistiques de temps réels |
| Charge estimée (jours) | `estimated_days` | Virgule ou point décimal |

Formats de date acceptés : `AAAA-MM-JJ`, `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA`,
`AAAA/MM/JJ`, `JJ/MM/AA`, `MM/JJ/AAAA`, `AAAAMMJJ`, ainsi que les vraies dates
Excel. Une date illisible n'échoue pas : le champ est laissé vide et la ligne
porte un avertissement.

### Colonnes inconnues → champs personnalisés

Toute colonne non rapprochée d'un champ existant est proposée à la création comme
**champ personnalisé**, avec un type déduit du contenu (date, nombre, oui/non,
liste, texte, texte long). Vous pouvez modifier le libellé et le type,
rattacher la colonne à un champ personnalisé existant, ou l'ignorer.

## Étape 3 — Détails manquants

Chaque **catégorie, société de prestation, pilote ou étiquette absente de la
base** est listée avec son nombre d'occurrences et, le cas échéant, une
proposition de rapprochement avec un enregistrement proche.

Trois actions par valeur :

- **Créer en base** en complétant les informations manquantes :
  - catégorie : nom, code, durée type, description ;
  - société : nom, contact (nom, e-mail, téléphone), jours alloués ;
  - utilisateur : nom complet, e-mail, rôle ;
  - étiquette : nom, couleur.
- **Rattacher** à un enregistrement existant.
- **Ignorer** : le champ reste vide sur les audits concernés.

> Un utilisateur créé sans e-mail reçoit une adresse technique du type
> `prenom.nom@import.local` (domaine paramétrable par l'option
> `user_email_domain`) et **aucun mot de passe** : le compte ne peut pas servir à
> se connecter tant qu'un administrateur n'en a pas défini un.

## Étape 4 — Contrôle et import

L'aperçu signale par ligne :

- les **erreurs** (ligne non importée) : nom manquant ;
- les **avertissements** (ligne importée, champ ignoré) : date, nombre, priorité
  ou statut illisible ;
- les **doublons** : même référence (ou, à défaut, même nom) qu'un audit existant
  ou qu'une ligne précédente du fichier.

Options d'import :

| Option | Valeurs | Effet |
|---|---|---|
| En cas de doublon | `ignorer` (défaut), `mettre_a_jour`, `creer` | `mettre_a_jour` met à jour l'audit existant ; les doublons internes au fichier sont toujours ignorés |
| Statut par défaut | statut | Appliqué si la colonne statut est absente ou illisible |
| Priorité par défaut | priorité | Idem |
| Templates de la catégorie | oui / non | Applique automatiquement les templates de pré-requis et de phases de la catégorie de l'audit |

Le rapport final indique le nombre d'audits créés et mis à jour, de lignes
ignorées, d'entités et de champs créés, ainsi que le détail des lignes rejetées.
Il est conservé dans le lot d'import ; les audits créés portent la référence du
lot (`import_batch_id`).

## Ordre de grandeur

Sur la configuration de référence ([dimensionnement.md](dimensionnement.md)) :
analyse d'un fichier de 1 000 lignes ≈ 1,8 s, création de 1 000 audits ≈ 4,5 s.
Un lot de 5 000 lignes prend donc une vingtaine de secondes ; c'est un traitement
synchrone : gardez l'onglet ouvert jusqu'au rapport.
