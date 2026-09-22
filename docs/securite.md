# Sécurité

## Périmètre

L'application **ne stocke ni résultats d'audit ni vulnérabilités** : elle traite
des informations de pilotage (planning, charge, contacts, pré-requis) et les
documents que les utilisateurs y attachent. Le niveau de sensibilité dépend donc
principalement de ces pièces jointes.

## Authentification

- Mots de passe hachés avec **bcrypt** (`passlib`), jamais stockés en clair.
- Jetons **JWT** signés (`SECRET_KEY`), durée de validité paramétrable
  (8 h par défaut). Le jeton porte l'identifiant et le rôle.
- Le frontend stocke le jeton dans `localStorage` et le purge sur réponse 401.
- Un compte sans mot de passe (créé par import, ou provisionné SSO) **ne peut pas
  se connecter** : la vérification échoue explicitement.
- Un compte désactivé (`is_active = false`) est refusé à la connexion et invalide
  les jetons existants au premier appel authentifié.

## Habilitations

Contrôle par rôle à chaque point d'entrée (`require_admin`,
`require_pilote_or_admin`) :

| Domaine | Lecture | Écriture |
|---|---|---|
| Audits, phases, pré-requis, documents | tout utilisateur authentifié | `admin`, `pilote_audit` |
| Cochage des pré-requis | — | tout utilisateur authentifié (traçé : auteur et horodatage) |
| Import en masse | `admin`, `pilote_audit` | `admin`, `pilote_audit` |
| Catégories, étiquettes, kanban, champs personnalisés, paramètres, utilisateurs | tout utilisateur authentifié | `admin` |

> Le modèle actuel n'implémente pas de cloisonnement par périmètre : tout
> utilisateur authentifié voit l'ensemble des audits. Si un cloisonnement par
> service est requis, il doit être ajouté au niveau des requêtes de lecture.

## Fichiers déposés

- Taille maximale contrôlée (`MAX_UPLOAD_SIZE_MB`, 50 Mo par défaut), pour les
  documents comme pour les fichiers d'import.
- Nom de fichier assaini (`Path(...).name`) : pas de traversée de répertoire.
- Stockage sous un nom généré (UUID) dans un répertoire par audit ; le nom
  d'origine n'est utilisé que pour le téléchargement.
- Les fichiers sont servis par l'API authentifiée, jamais exposés en statique.

## Import en masse

- Aucune écriture en base pendant l'analyse.
- Les entités créées le sont explicitement, sur décision de l'analyste.
- Les comptes créés par import sont sans mot de passe et doivent être finalisés
  par un administrateur — vérifiez également les adresses e-mail générées
  automatiquement.
- Le contenu importé est traité comme de la donnée : il n'est ni interprété ni
  exécuté, et les valeurs sont typées avant écriture.

## Points de vigilance avant mise en production

1. Changer `SECRET_KEY`, `POSTGRES_PASSWORD` et le mot de passe administrateur.
2. Restreindre `CORS_ORIGINS` à l'URL réelle de l'application.
3. Placer l'application derrière un terminateur **TLS** (le Compose fourni expose
   du HTTP en clair sur le port 9090).
4. Restreindre l'accès réseau à la base de données au seul backend.
5. Mettre en place la sauvegarde chiffrée des volumes (base et documents).
6. Revoir périodiquement les comptes (`admin` en particulier) et désactiver ceux
   qui ne sont plus utilisés.

## SSO / OIDC

Le modèle prévoit `auth_provider` (`local` / `sso`) et `sso_subject`, et la
configuration `OIDC_*`. L'endpoint `GET /api/auth/sso/status` indique si le SSO
est configuré. **Le flux OIDC complet reste à implémenter** selon le fournisseur
retenu ; le schéma de données n'aura pas à évoluer.
