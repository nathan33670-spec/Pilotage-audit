# Documentation — Pilotage Audit

Documentation de l'application de pilotage des audits / tests d'intrusion (TI).

| Document | Contenu |
|---|---|
| [architecture.md](architecture.md) | Vue d'ensemble technique, composants, flux, choix structurants |
| [modele-de-donnees.md](modele-de-donnees.md) | Tables, relations, cycle de vie des données, migrations |
| [guide-utilisateur.md](guide-utilisateur.md) | Parcours quotidiens : audits, kanban, planning, pré-requis, documents |
| [guide-administrateur.md](guide-administrateur.md) | Kanban configurable, catégories, étiquettes, champs personnalisés, comptes |
| [import-en-masse.md](import-en-masse.md) | Import des TI : format de fichier, correspondances, détails manquants, doublons |
| [planning.md](planning.md) | Échelles de planning, vue glissante, cycles pluriannuels, sélections |
| [statistiques.md](statistiques.md) | Tableaux de bord, définition des durées réelles, indicateurs |
| [api.md](api.md) | Référence des points d'entrée HTTP |
| [exploitation.md](exploitation.md) | Déploiement, configuration, sauvegardes, mise à jour, supervision |
| [deploiement-synology.md](deploiement-synology.md) | Installation pas à pas sur un NAS Synology (DSM 7) |
| [dimensionnement.md](dimensionnement.md) | **Mesures de charge et limites** : volumétrie supportée, seuils d'alerte |
| [securite.md](securite.md) | Authentification, habilitations, données, points de vigilance |
| [developpement.md](developpement.md) | Environnement local, tests, conventions, ajout de fonctionnalités |
| [presentation-equipe.pdf](presentation-equipe.pdf) | **Plaquette de présentation** (17 pages) : captures commentées de l'application, sur jeu de données fictif |

La documentation fonctionnelle essentielle est également disponible **dans
l'application** (menu « Documentation »), et la référence interactive de l'API
sur `/api/docs` (Swagger UI) une fois l'application démarrée.

## Vocabulaire

| Terme | Définition |
|---|---|
| **TI** | Test d'intrusion / audit technique planifié dans l'outil. Une ligne de fichier d'import = un TI = un audit. |
| **Phase** | Étape datée d'un audit (cadrage, exécution, restitution…), affectée à un auditeur. |
| **Catégorie** | Axe de classement principal d'un audit (un seul par audit) ; porte les templates. |
| **Étiquette** | Classement transverse, multiple, libre. |
| **Pré-requis** | Élément à fournir avant le démarrage (accès, comptes, documentation…). |
| **Colonne kanban** | État du tableau de suivi, entièrement configurable par un administrateur. |
| **Durée planifiée / réelle** | Voir [statistiques.md](statistiques.md#définition-des-durées). |
