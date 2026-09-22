# Guide administrateur

Menu **Administration** (réservé au rôle `admin`), cinq onglets.

## 1. Kanban

Le tableau est **entièrement configurable** — aucune modification de code n'est
nécessaire pour faire évoluer le workflow.

### Colonnes

| Propriété | Effet |
|---|---|
| **Libellé** | Titre affiché en tête de colonne |
| **Clé technique** | Identifiant stable (déduit du libellé si laissé vide), utilisé par l'API |
| **Description** | Infobulle d'aide au survol du titre |
| **Couleur** | Liseré de la colonne |
| **Limite d'en-cours (WIP)** | Au-delà, le compteur passe en rouge et un avertissement s'affiche |
| **Statut appliqué** | Statut donné à l'audit déposé dans la colonne. *Aucun* = colonne purement organisationnelle, le statut n'est pas modifié |
| **Colonne par défaut** | Reçoit les audits sans colonne (créations, imports, colonne supprimée) |
| **Colonne finale** | Marque la fin du cycle (information de pilotage) |
| **Visible** | Une colonne masquée disparaît du tableau sans perdre son contenu |

Actions : création, modification, **réordonnancement** (flèches), masquage,
suppression. À la suppression, une boîte de dialogue demande **vers quelle
colonne déplacer les audits** : aucun audit n'est perdu. La dernière colonne ne
peut pas être supprimée.

### Affichage des cartes

- champs affichés (priorité, catégorie, étiquettes, pilote, prestataire, dates) ;
- source de la couleur de carte : priorité, statut ou catégorie ;
- activation du glisser-déposer, affichage des colonnes vides, affichage des
  limites d'en-cours.

Ces réglages sont enregistrés dans `app_settings` et s'appliquent à tous les
utilisateurs.

## 2. Catégories d'audit

Nom, code, couleur, durée type et description. La catégorie porte les templates
de pré-requis et de phases.

Une catégorie **utilisée par des audits ne peut pas être supprimée** : réaffectez
d'abord les audits concernés. Ce garde-fou évite de perdre l'axe de classement
principal d'un portefeuille.

## 3. Étiquettes

Classement transverse et multiple. Nom, couleur, description. La suppression
d'une étiquette la retire des audits sans autre effet.

## 4. Champs personnalisés

Champs additionnels de la fiche d'audit :

- **types** : texte court, texte long, nombre, date, oui/non, liste de valeurs ;
- **clé** : identifiant technique (déduit du libellé), utilisé par l'API et les
  imports ;
- **afficher dans la liste** : ajoute une colonne à la liste des audits ;
- **actif** : décocher masque le champ **sans supprimer** les valeurs déjà saisies.

Les champs créés par un import sont marqués « Import » dans la colonne *Origine*.

## 5. Utilisateurs

Création, changement de rôle, réinitialisation de mot de passe, désactivation.

> Les comptes créés automatiquement lors d'un import **n'ont pas de mot de passe**
> et ne peuvent pas se connecter tant qu'un administrateur n'en définit pas un.
> Vérifiez également leur adresse e-mail, générée automatiquement si le fichier
> n'en fournissait pas.

## Sociétés de prestation et templates

Gérés depuis leurs entrées de menu dédiées (accessibles aux pilotes d'audit) :
jours alloués et consommation d'une part, contenu des templates de pré-requis et
de phases d'autre part.
