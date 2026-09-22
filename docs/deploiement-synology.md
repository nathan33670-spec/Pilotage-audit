# Déploiement sur NAS Synology (DSM 7)

Procédure complète pour héberger l'application sur un NAS Synology, depuis la
récupération du code jusqu'à l'accès en HTTPS.

## Prérequis

| Élément | Détail |
|---|---|
| DSM | 7.0 ou supérieur |
| Paquet | **Container Manager** (DSM 7.2+) ou **Docker** (DSM 7.0/7.1), installé depuis le Centre de paquets |
| Accès | SSH activé (Panneau de configuration → Terminal & SNMP → Activer le service SSH) |
| Architecture | NAS **x86_64** ou **ARM 64 bits**. Les modèles ARMv7 32 bits (DS220j, DS120j…) ne sont pas supportés : les images officielles PostgreSQL/Node n'existent pas pour cette architecture |
| Ressources | 2 Go de RAM libres recommandés, 5 Go d'espace disque |

Toutes les commandes s'exécutent en SSH, avec `sudo`.

## 1. Récupérer le code

```bash
sudo mkdir -p /volume1/docker/pilotage-audit
cd /volume1/docker/pilotage-audit
```

**Si le dépôt est public :**

```bash
sudo wget -O source.tar.gz https://github.com/nathan33670-spec/Pilotage-audit/archive/refs/heads/main.tar.gz
sudo tar xzf source.tar.gz --strip-components=1
sudo rm source.tar.gz
```

**Si le dépôt est privé** (jeton d'accès personnel GitHub avec la portée
`repo`, à créer dans Settings → Developer settings → Personal access tokens) :

```bash
sudo wget --header="Authorization: Bearer VOTRE_JETON" \
     -O source.tar.gz \
     https://api.github.com/repos/nathan33670-spec/Pilotage-audit/tarball/main
sudo tar xzf source.tar.gz --strip-components=1
sudo rm source.tar.gz
```

**Sans ligne de commande** : télécharger l'archive depuis GitHub, la déposer
dans le dossier partagé `docker` via File Station, puis l'extraire par un clic
droit → Extraire.

## 2. Configurer l'application

```bash
sudo cp .env.example .env
sudo vi .env        # ou éditer le fichier depuis File Station
```

Valeurs à renseigner impérativement :

```bash
POSTGRES_PASSWORD=<mot de passe long et aléatoire>
SECRET_KEY=<valeur aléatoire, ex. openssl rand -hex 32>
ADMIN_PASSWORD=<mot de passe du compte administrateur initial>
ADMIN_EMAIL=prenom.nom@exemple.fr

HTTP_PORT=8080                                   # port d'écoute sur le NAS
CORS_ORIGINS=["http://192.168.1.50:8080"]        # URL réelle d'accès
```

Générer les secrets sans les inventer :

```bash
openssl rand -hex 32     # pour SECRET_KEY
openssl rand -base64 24  # pour les mots de passe
```

> **Port** : 5000, 5001 (DSM), 80 et 443 (Web Station) sont déjà pris. 8080 est
> libre sur la plupart des installations ; en cas de conflit, choisir 8081 ou
> 9080 et l'indiquer dans `HTTP_PORT` **et** dans `CORS_ORIGINS`.

## 3. Stocker les données dans un dossier partagé

Par défaut, la base et les documents sont dans des volumes Docker internes,
invisibles depuis File Station. La surcouche fournie les place dans
`/volume1/docker/pilotage-audit` afin qu'Hyper Backup puisse les sauvegarder :

```bash
sudo cp deploy/synology/docker-compose.override.yml ./docker-compose.override.yml
sudo mkdir -p /volume1/docker/pilotage-audit/db /volume1/docker/pilotage-audit/uploads
sudo chown -R 999:999  /volume1/docker/pilotage-audit/db        # utilisateur postgres
sudo chown -R 1000:1000 /volume1/docker/pilotage-audit/uploads  # utilisateur applicatif
```

Les deux `chown` ne sont pas facultatifs : sans eux, PostgreSQL refuse de
démarrer (« data directory has wrong ownership ») et les dépôts de documents
échouent.

Pour conserver les volumes Docker internes, sauter cette étape et ne pas copier
la surcouche.

## 4. Construire et démarrer

DSM 7.2 et supérieur :

```bash
sudo docker compose up -d --build
```

DSM 7.0 / 7.1 (paquet Docker) :

```bash
sudo docker-compose up -d --build
```

La première construction compile le frontend sur le NAS : compter **5 à 20
minutes** selon le modèle. Sur un NAS avec moins de 2 Go de RAM libres, l'étape
`npm run build` peut être tuée par manque de mémoire ; dans ce cas, construire
les images sur un poste de travail puis les transférer :

```bash
# sur le poste de travail
docker compose build
docker save pilotage-audit-frontend pilotage-audit-backend | gzip > images.tar.gz
# sur le NAS
sudo docker load < images.tar.gz
sudo docker compose up -d
```

Vérifier le démarrage :

```bash
sudo docker compose ps
sudo docker compose logs -f backend
curl -s http://localhost:8080/api/health     # {"status":"ok","version":"..."}
```

L'application est accessible sur `http://<adresse-du-NAS>:8080`. Se connecter
avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`, **changer ce mot de passe immédiatement**,
puis créer les comptes de l'équipe.

## 5. Accès en HTTPS (recommandé)

Le conteneur frontend sert du HTTP en clair. Pour exposer l'application avec un
certificat, utiliser le proxy inverse de DSM :

1. Panneau de configuration → **Portail de connexion** → Avancé → **Proxy inversé**
   → Créer :
   - Source : `HTTPS`, nom d'hôte `audit.mondomaine.fr`, port `443`
   - Destination : `HTTP`, `localhost`, port `8080`
2. Panneau de configuration → **Sécurité** → Certificat : obtenir un certificat
   Let's Encrypt pour ce nom d'hôte et l'affecter au service créé.
3. Mettre `CORS_ORIGINS=["https://audit.mondomaine.fr"]` dans `.env`, puis
   `sudo docker compose up -d` pour appliquer.

Ne pas publier l'application sur Internet sans réflexion préalable : elle
contient des informations de planification internes. Un accès par VPN (paquet
VPN Server de DSM) est préférable à une ouverture de port.

## 6. Sauvegardes

Deux éléments à sauvegarder : la base et les documents.

```bash
# Base de données (script à placer dans une tâche planifiée DSM)
sudo docker compose exec -T db pg_dump -U audit audit | gzip \
  > /volume1/docker/pilotage-audit/sauvegardes/audit-$(date +%F).sql.gz
```

Les documents sont dans `/volume1/docker/pilotage-audit/uploads` (avec la
surcouche de l'étape 3) : les inclure dans une tâche **Hyper Backup**, avec le
dossier des sauvegardes SQL.

Restauration :

```bash
gunzip -c audit-AAAA-MM-JJ.sql.gz | sudo docker compose exec -T db psql -U audit audit
```

## 7. Mise à jour

```bash
cd /volume1/docker/pilotage-audit
sudo docker compose down
sudo wget -O source.tar.gz https://github.com/nathan33670-spec/Pilotage-audit/archive/refs/heads/main.tar.gz
sudo tar xzf source.tar.gz --strip-components=1 && sudo rm source.tar.gz
sudo docker compose up -d --build
```

Le fichier `.env` et le dossier de données ne sont pas écrasés par l'extraction.
Les migrations de schéma s'appliquent automatiquement au démarrage du backend.
**Sauvegarder la base avant toute mise à jour.**

## 8. Démarrage automatique et supervision

`restart: unless-stopped` est déjà positionné : les conteneurs redémarrent avec
le NAS. Container Manager affiche les trois conteneurs, leur consommation et
leurs journaux ; le projet peut aussi y être importé (Projet → Créer → dossier
existant) pour piloter l'ensemble depuis l'interface DSM.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `bind: address already in use` | Port `HTTP_PORT` déjà utilisé sur le NAS : en choisir un autre |
| `data directory has wrong ownership` | `chown 999:999` manquant sur le dossier `db` |
| Dépôt de document en erreur 500 | `chown 1000:1000` manquant sur le dossier `uploads` |
| `npm run build` tué pendant la construction | Mémoire insuffisante : construire les images sur un poste de travail (étape 4) |
| Page blanche, API injoignable | Vérifier `sudo docker compose logs backend` et que `CORS_ORIGINS` correspond à l'URL utilisée |
| `exec format error` | NAS ARM 32 bits : architecture non supportée |
