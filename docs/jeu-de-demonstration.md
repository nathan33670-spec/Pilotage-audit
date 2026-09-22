# Jeu de démonstration

Le script `backend/scripts/seed_demo.py` remplit l'application avec **une année
type de données fictives** : de quoi présenter l'outil à une équipe, former des
utilisateurs ou vérifier une installation, sans saisir quoi que ce soit à la main.

## Lancer le script

```bash
# Installation Docker (le plus courant)
docker compose exec backend python -m scripts.seed_demo

# Installation locale
cd backend && python -m scripts.seed_demo
```

L'application est immédiatement peuplée : rafraîchir la page suffit.

## Ce qui est créé

Pour l'année en cours, réparti sur les douze mois :

| Élément | Contenu |
|---|---|
| **Audits** | 28 campagnes, référencées `TI-<année>-001` et suivantes |
| **Catégories** | 7 (applicatif externe et interne, infrastructure, cloud, red team, configuration, revue de code) |
| **Étiquettes** | 8 (DORA, PCI-DSS, RGPD, exposition Internet, donnée sensible…) |
| **Sociétés de prestation** | 4, avec contacts et jours alloués |
| **Comptes** | 4 pilotes, 4 auditeurs, 3 responsables de service |
| **Phases** | 5 par audit (cadrage, préparation, exécution, restitution, plan d'action), avec auditeur affecté |
| **Pré-requis** | 6 par audit, cochés selon l'avancement |
| **Champs personnalisés** | application concernée, entité commanditaire, référentiel de contrôle, budget |
| **Templates** | pré-requis et phases sur les trois catégories les plus courantes |

La répartition est pensée pour que **chaque écran ait quelque chose à montrer** :

- les campagnes passées sont **terminées avec leurs dates réelles**, ce qui
  alimente les statistiques de durée, d'écart au planning et de respect des délais ;
- quelques-unes sont **en cours, en attente ou bloquées** autour d'aujourd'hui,
  pour que toutes les colonnes du kanban soient occupées ;
- d'autres sont **planifiées ou en brouillon** dans les semaines qui viennent,
  pour que le planning ait de la matière vers l'avant.

## Options

| Option | Effet |
|---|---|
| `--annee 2027` | Année civile à générer (défaut : année en cours) |
| `--audits 40` | Nombre de campagnes (défaut : 28) |
| `--mot-de-passe Demo1234!` | Donne un mot de passe aux comptes de démonstration, pour se connecter en tant que pilote ou responsable |
| `--graine 12` | Graine aléatoire : à graine égale, jeu identique |
| `--force` | Ajoute le jeu même si la base contient déjà des audits |
| `--purge` | Retire le jeu de démonstration, puis quitte |

Exemples :

```bash
# Une année passée complète, pour une démonstration des statistiques
docker compose exec backend python -m scripts.seed_demo --annee 2025 --audits 40

# Avec des comptes utilisables pour montrer les différents rôles
docker compose exec backend python -m scripts.seed_demo --mot-de-passe 'Demo1234!'
```

## Retirer le jeu de démonstration

```bash
docker compose exec backend python -m scripts.seed_demo --purge
```

La purge est **ciblée** : elle ne retire que ce que le script a créé — les audits
portant le marqueur `import_batch_id = "demo"`, les comptes en `@demo.local`, et
les catégories, étiquettes et sociétés de démonstration **restées inutilisées**.
Une catégorie ou une société à laquelle vous auriez rattaché un audit réel est
conservée.

## Précautions

- **Ne pas semer une base de production.** Par sécurité, le script refuse de
  s'exécuter si la base contient déjà des audits ; `--force` passe outre, à vos
  risques.
- **Créer l'administrateur d'abord.** Le compte administrateur initial n'est créé
  au démarrage de l'application que si la table des utilisateurs est vide. Sur une
  base vierge, le script s'en charge à partir de `ADMIN_EMAIL` / `ADMIN_PASSWORD`
  (présents dans l'environnement du conteneur `backend`) ; s'ils sont absents, il
  vous avertit sans créer de compte.
- **Comptes sans mot de passe par défaut** : les utilisateurs de démonstration ne
  peuvent pas se connecter tant que `--mot-de-passe` n'est pas fourni, ou qu'un
  administrateur ne leur en a pas défini un.
- **Documents sans fichier** : les audits terminés portent un rapport pour que la
  fiche montre la section Documents, mais aucun fichier n'est écrit sur disque —
  leur téléchargement renvoie une erreur. C'est sans conséquence pour une
  démonstration.
- Les données sont **entièrement fictives** : noms de campagnes, de pilotes, de
  prestataires et d'applications ne correspondent à aucun périmètre réel.
