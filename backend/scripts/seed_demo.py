# -*- coding: utf-8 -*-
"""Remplit l'application avec une année type de données de démonstration.

Génère un portefeuille de TI plausible sur une année civile : catégories,
étiquettes, sociétés de prestation, comptes, templates, puis des audits répartis
sur les douze mois — terminés dans le passé (avec dates réelles, ce qui alimente
les statistiques de durée), en cours autour d'aujourd'hui, planifiés ensuite.

Toutes les données sont **fictives**. Les audits créés portent le marqueur
`import_batch_id = "demo"`, ce qui permet de les retirer ensuite avec --purge.

Utilisation :
    # dans Docker
    docker compose exec backend python -m scripts.seed_demo
    docker compose exec backend python -m scripts.seed_demo --annee 2027 --audits 30
    docker compose exec backend python -m scripts.seed_demo --purge

    # en local
    cd backend && python -m scripts.seed_demo
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from datetime import date, timedelta

from sqlalchemy import select

from app.database import Base, SessionLocal, engine
from app.migrations import run_migrations
from app.models import (
    Audit,
    AuditCustomValue,
    AuditPhase,
    AuditPrerequisite,
    AuditPriority,
    AuditStatus,
    AuthProvider,
    Category,
    CustomFieldDefinition,
    CustomFieldType,
    Document,
    KanbanColumn,
    PhaseStatus,
    PhaseTemplate,
    PhaseTemplateItem,
    PrerequisiteTemplate,
    PrerequisiteTemplateItem,
    PrestationCompany,
    Tag,
    User,
    UserRole,
)
from app.security import hash_password

MARQUEUR = "demo"
DOMAINE = "demo.local"

CATEGORIES = [
    ("Applicatif externe", "APP-EXT", "#1565c0", 10, "Applications exposées sur Internet (portails, API publiques)"),
    ("Applicatif interne", "APP-INT", "#42a5f5", 8, "Applications du système d'information interne"),
    ("Infrastructure & réseau", "INFRA", "#00897b", 12, "Socle technique : réseau, annuaire, hyperviseurs, sauvegardes"),
    ("Cloud & conteneurs", "CLOUD", "#7e57c2", 10, "Environnements cloud publics et plateformes conteneurisées"),
    ("Red team", "REDTEAM", "#e53935", 25, "Campagne offensive multi-vecteurs avec objectifs métier"),
    ("Audit de configuration", "CONFIG", "#ff9800", 5, "Revue de configuration au regard des guides de durcissement"),
    ("Revue de code", "CODE", "#43a047", 7, "Analyse de code source sur les composants sensibles"),
]

ETIQUETTES = [
    ("DORA", "#1565c0"), ("PCI-DSS", "#e53935"), ("RGPD", "#7e57c2"),
    ("Exposition Internet", "#ff9800"), ("Donnée sensible", "#b3261e"),
    ("Nouveau service", "#00897b"), ("Récurrent annuel", "#546e7a"),
    ("Plan de remédiation", "#8d6e63"),
]

PILOTES = ["Camille Durand", "Hugo Lefèvre", "Inès Moreau", "Sofia Benali"]
AUDITEURS = ["Thomas Petit", "Léa Garnier", "Mehdi Amrani", "Anne Rousseau"]
RESPONSABLES = ["Julien Marchand", "Claire Dubois", "Karim Haddad"]

SOCIETES = [
    ("SecuAudit", "Nicolas Berger", 180, "Marché cadre — lot « tests d'intrusion applicatifs »"),
    ("CyberTest SAS", "Émilie Fontaine", 120, "Lot « infrastructure et red team »"),
    ("Orion Sécurité", "Paul Rivière", 90, "Lot « cloud et conteneurs »"),
    ("NordPen", "Sarah Lemoine", 60, "Marché subséquent — revue de code"),
]

PHASES = [("Cadrage", 2), ("Préparation & pré-requis", 3), ("Exécution des tests", 8),
          ("Restitution", 2), ("Plan d'action", 3)]

PREREQUIS = [
    "Comptes de test nominatifs fournis",
    "URL et périmètre technique validés",
    "Autorisation d'audit signée",
    "Contacts techniques et créneaux d'astreinte communiqués",
    "Jeux de données de test disponibles",
    "Filtrage WAF/IPS adapté pour la campagne",
]

# (intitulé, catégorie, code applicatif, entité commanditaire)
PERIMETRES = [
    ("Portail client particuliers", "Applicatif externe", "PORTAIL-CLI", "Direction Digitale"),
    ("Application mobile paiement", "Applicatif externe", "MOBPAY", "Direction Digitale"),
    ("API ouverte agrégateurs (DSP2)", "Applicatif externe", "API-DSP2", "Direction Paiements"),
    ("Espace bourse en ligne", "Applicatif externe", "BOURSE", "Direction Épargne"),
    ("Site institutionnel groupe", "Applicatif externe", "SITEINST", "Communication"),
    ("Extranet courtiers", "Applicatif externe", "EXTRANET-C", "Direction Assurance"),
    ("Outil de gestion des crédits", "Applicatif interne", "CREDIX", "Direction Crédits"),
    ("Poste de travail conseiller", "Applicatif interne", "PDT-CONS", "Réseau d'agences"),
    ("Référentiel client (CRM)", "Applicatif interne", "CRM360", "Direction Données"),
    ("Outil de lutte anti-blanchiment", "Applicatif interne", "LAB-SCAN", "Conformité"),
    ("Annuaire d'entreprise", "Infrastructure & réseau", "ANNUAIRE", "Infrastructure"),
    ("Datacenter principal — segmentation", "Infrastructure & réseau", "DC-SEG", "Infrastructure"),
    ("Accès distants VPN/VDI", "Infrastructure & réseau", "VPN-VDI", "Infrastructure"),
    ("Sauvegardes et plan de reprise", "Infrastructure & réseau", "PRA", "Production"),
    ("Réseau des agences", "Infrastructure & réseau", "SDWAN", "Réseau d'agences"),
    ("Suite bureautique en ligne", "Cloud & conteneurs", "BUREAU365", "Poste de travail"),
    ("Plateforme de conteneurs interne", "Cloud & conteneurs", "K8S-PROD", "Production"),
    ("Environnement cloud paiements", "Cloud & conteneurs", "CLOUD-PAY", "Direction Paiements"),
    ("Chaîne d'intégration continue", "Cloud & conteneurs", "CICD", "Production"),
    ("Campagne red team groupe", "Red team", "RT-GROUPE", "RSSI Groupe"),
    ("Campagne red team filiale assurance", "Red team", "RT-ASSUR", "RSSI Assurance"),
    ("Durcissement serveurs Windows", "Audit de configuration", "CONF-WIN", "Infrastructure"),
    ("Durcissement serveurs Linux", "Audit de configuration", "CONF-LNX", "Infrastructure"),
    ("Configuration pare-feu périmétrique", "Audit de configuration", "CONF-FW", "Réseau"),
    ("Postes de travail — stratégies de groupe", "Audit de configuration", "CONF-GPO", "Poste de travail"),
    ("Revue de code API virements", "Revue de code", "CODE-VIR", "Direction Paiements"),
    ("Revue de code module authentification", "Revue de code", "CODE-AUTH", "Direction Digitale"),
    ("Revue de code moteur de scoring", "Revue de code", "CODE-SCOR", "Direction Crédits"),
]

REFERENTIELS = ["ISO 27001", "PCI-DSS v4", "EBIOS RM", "Guide ANSSI", "NIST CSF"]

CHAMPS = [
    ("application", "Application concernée", CustomFieldType.TEXTE, None, True,
     "Code de l'application dans le référentiel du SI"),
    ("entite", "Entité commanditaire", CustomFieldType.TEXTE, None, True, None),
    ("referentiel", "Référentiel de contrôle", CustomFieldType.LISTE, REFERENTIELS, False, None),
    ("budget", "Budget engagé (k€)", CustomFieldType.NOMBRE, None, False, None),
]


def _slug(nom: str) -> str:
    accents = str.maketrans("àâäéèêëîïôöùûüç", "aaaeeeeiioouuuc")
    return nom.lower().translate(accents).replace(" ", ".").replace("'", "")


def _compte(db, nom: str, role: UserRole, mot_de_passe: str | None) -> User:
    email = f"{_slug(nom)}@{DOMAINE}"
    existant = db.scalar(select(User).where(User.email == email))
    if existant:
        return existant
    compte = User(
        email=email, full_name=nom, role=role, auth_provider=AuthProvider.LOCAL,
        hashed_password=hash_password(mot_de_passe) if mot_de_passe else None,
    )
    db.add(compte)
    return compte


def _garantir_admin(db) -> None:
    """Le compte administrateur n'est créé au démarrage de l'application que si
    la table des utilisateurs est vide. Semer avant le premier démarrage la
    remplirait, et plus aucun administrateur ne serait créé : on s'en charge ici.
    """
    if db.scalar(select(User).where(User.role == UserRole.ADMIN)):
        return

    email = os.getenv("ADMIN_EMAIL", "admin@pilotage-audit.local")
    mot_de_passe = os.getenv("ADMIN_PASSWORD")
    if not mot_de_passe:
        print("ATTENTION : aucun compte administrateur n'existe et ADMIN_PASSWORD n'est pas défini.\n"
              "            Les comptes créés ici empêcheront la création automatique au démarrage.\n"
              "            Définir ADMIN_EMAIL / ADMIN_PASSWORD et relancer, ou créer l'administrateur\n"
              "            avant de semer.", file=sys.stderr)
        return

    db.add(User(email=email, full_name="Administrateur", role=UserRole.ADMIN,
                auth_provider=AuthProvider.LOCAL, hashed_password=hash_password(mot_de_passe)))
    db.flush()
    print(f"Compte administrateur créé : {email}")


def purger(db) -> None:
    """Retire uniquement ce que ce script a créé."""
    audits = db.scalars(select(Audit).where(Audit.import_batch_id == MARQUEUR)).all()
    for audit in audits:
        db.delete(audit)          # phases, pré-requis, documents et valeurs en cascade
    db.flush()

    comptes = db.scalars(select(User).where(User.email.like(f"%@{DOMAINE}"))).all()
    for compte in comptes:
        db.delete(compte)

    for societe in db.scalars(select(PrestationCompany)).all():
        if societe.name in {nom for nom, *_ in SOCIETES} and not societe.audits:
            db.delete(societe)
    for etiquette in db.scalars(select(Tag)).all():
        if etiquette.name in {nom for nom, _ in ETIQUETTES} and not etiquette.audits:
            db.delete(etiquette)
    for categorie in db.scalars(select(Category)).all():
        if categorie.name in {nom for nom, *_ in CATEGORIES} and not categorie.audits:
            db.delete(categorie)

    db.commit()
    print(f"Purge terminée : {len(audits)} audit(s) et {len(comptes)} compte(s) de démonstration retirés.")


def remplir(db, annee: int, nombre: int, mot_de_passe: str | None, graine: int) -> None:
    random.seed(graine)
    aujourdhui = date.today()

    _garantir_admin(db)

    categories = {}
    for position, (nom, code, couleur, duree, description) in enumerate(CATEGORIES):
        categorie = db.scalar(select(Category).where(Category.name == nom))
        if categorie is None:
            categorie = Category(name=nom, code=code, color=couleur, default_duration_days=duree,
                                 description=description, position=position)
            db.add(categorie)
        categories[nom] = categorie

    etiquettes = {}
    for nom, couleur in ETIQUETTES:
        etiquette = db.scalar(select(Tag).where(Tag.name == nom))
        if etiquette is None:
            etiquette = Tag(name=nom, color=couleur)
            db.add(etiquette)
        etiquettes[nom] = etiquette

    societes = {}
    for nom, contact, jours, notes in SOCIETES:
        societe = db.scalar(select(PrestationCompany).where(PrestationCompany.name == nom))
        if societe is None:
            societe = PrestationCompany(
                name=nom, contact_name=contact, contact_email=f"contact@{_slug(nom)}.example",
                contact_phone="01 23 45 67 89", allocated_days=jours, notes=notes,
            )
            db.add(societe)
        societes[nom] = societe

    pilotes = [_compte(db, nom, UserRole.PILOTE_AUDIT, mot_de_passe) for nom in PILOTES]
    auditeurs = [_compte(db, nom, UserRole.PILOTE_AUDIT, mot_de_passe) for nom in AUDITEURS]
    responsables = [_compte(db, nom, UserRole.RESPONSABLE_SERVICE, mot_de_passe) for nom in RESPONSABLES]

    champs = {}
    for position, (cle, libelle, type_champ, options, dans_liste, description) in enumerate(CHAMPS, start=1):
        champ = db.scalar(select(CustomFieldDefinition).where(CustomFieldDefinition.key == cle))
        if champ is None:
            champ = CustomFieldDefinition(
                entity="audit", key=cle, label=libelle, field_type=type_champ, options=options,
                show_in_list=dans_liste, position=position, description=description,
            )
            db.add(champ)
        champs[cle] = champ

    db.flush()

    # Templates de pré-requis et de phases, sur les catégories les plus courantes
    for nom_categorie in ("Applicatif externe", "Infrastructure & réseau", "Cloud & conteneurs"):
        categorie = categories[nom_categorie]
        if not categorie.templates:
            template = PrerequisiteTemplate(
                category_id=categorie.id, name=f"Pré-requis — {nom_categorie}",
                description="Éléments à fournir par l'entité auditée avant le démarrage",
            )
            for index, libelle in enumerate(PREREQUIS):
                template.items.append(PrerequisiteTemplateItem(label=libelle, is_mandatory=index < 4, position=index))
            db.add(template)
        if not categorie.phase_templates:
            phases = PhaseTemplate(
                category_id=categorie.id, name=f"Déroulé standard — {nom_categorie}",
                description="Phases types d'une campagne",
            )
            for index, (nom_phase, duree) in enumerate(PHASES):
                phases.items.append(PhaseTemplateItem(name=nom_phase, position=index, duration_days=duree))
            db.add(phases)

    colonnes = {c.mapped_status: c for c in db.scalars(select(KanbanColumn)).all() if c.mapped_status}
    colonne_defaut = db.scalar(select(KanbanColumn).where(KanbanColumn.is_default.is_(True)))

    perimetres = (PERIMETRES * ((nombre // len(PERIMETRES)) + 1))[:nombre]
    pas = max(320 // max(nombre, 1), 1)

    # Première passe : fenêtres prévues, réparties sur l'année
    planning = []
    for index, (libelle, nom_categorie, code_applicatif, entite) in enumerate(perimetres):
        categorie = categories[nom_categorie]
        debut = date(annee, 1, 8) + timedelta(days=index * pas + random.randint(0, 3))
        if debut.year != annee:
            debut = date(annee, 12, 15)
        duree = (categorie.default_duration_days or 10) + random.randint(-2, 6)
        planning.append({"index": index, "libelle": libelle, "categorie": nom_categorie,
                         "code": code_applicatif, "entite": entite,
                         "debut": debut, "fin": debut + timedelta(days=duree), "duree": duree,
                         "statut": None})

    # Deuxième passe : si l'année générée est l'année en cours, on garantit un
    # tableau kanban vivant en recalant quelques campagnes autour d'aujourd'hui.
    if annee == aujourdhui.year:
        # En cours : les campagnes dont la fenêtre est la plus proche d'aujourd'hui.
        en_cours = [(-12, AuditStatus.EN_COURS), (-6, AuditStatus.EN_COURS),
                    (-3, AuditStatus.EN_COURS), (-18, AuditStatus.EN_ATTENTE),
                    (-9, AuditStatus.EN_ATTENTE), (-25, AuditStatus.BLOQUE)]
        # À venir : les campagnes les plus tardives, décalées après aujourd'hui,
        # pour ne pas entamer l'historique du début d'année.
        a_venir = [(5, AuditStatus.PLANIFIE), (12, AuditStatus.PLANIFIE),
                   (26, AuditStatus.PLANIFIE), (40, AuditStatus.PLANIFIE),
                   (54, AuditStatus.BROUILLON)]

        proches = sorted(planning, key=lambda p: abs((p["debut"] - aujourdhui).days))[:len(en_cours)]
        restants = [p for p in planning if p not in proches]
        tardifs = sorted(restants, key=lambda p: p["debut"], reverse=True)[:len(a_venir)]

        for entree, (decalage, statut) in list(zip(proches, en_cours)) + list(zip(tardifs, a_venir)):
            entree["debut"] = aujourdhui + timedelta(days=decalage)
            entree["fin"] = entree["debut"] + timedelta(days=entree["duree"])
            entree["statut"] = statut

    cree = 0
    for entree in planning:
        libelle, nom_categorie = entree["libelle"], entree["categorie"]
        code_applicatif, entite = entree["code"], entree["entite"]
        categorie = categories[nom_categorie]
        debut, fin, duree = entree["debut"], entree["fin"], entree["duree"]
        index = entree["index"]

        statut = entree["statut"]
        if statut is None:
            # Statut déduit de la position de la campagne par rapport à aujourd'hui
            if fin < aujourdhui - timedelta(days=7):
                statut = AuditStatus.TERMINE if random.random() < 0.92 else AuditStatus.ANNULE
            elif debut <= aujourdhui <= fin + timedelta(days=7):
                statut = AuditStatus.EN_COURS
            elif debut <= aujourdhui + timedelta(days=60):
                statut = AuditStatus.PLANIFIE
            else:
                statut = random.choice([AuditStatus.PLANIFIE, AuditStatus.PLANIFIE, AuditStatus.BROUILLON])

        termine = statut == AuditStatus.TERMINE
        en_cours = statut in (AuditStatus.EN_COURS, AuditStatus.EN_ATTENTE, AuditStatus.BLOQUE)
        debut_reel = debut + timedelta(days=random.randint(-1, 3)) if (termine or en_cours) else None
        fin_reelle = debut_reel + timedelta(days=duree + random.randint(-2, 7)) if termine else None

        priorite = (AuditPriority.CRITIQUE if nom_categorie == "Red team" or "paiement" in libelle.lower()
                    else random.choice([AuditPriority.HAUTE, AuditPriority.MOYENNE, AuditPriority.MOYENNE,
                                        AuditPriority.HAUTE, AuditPriority.BASSE]))
        societe = random.choice(list(societes.values())) if random.random() < 0.8 else None
        pilote = random.choice(pilotes)
        responsable = random.choice(responsables)
        prefixe = "Audit" if nom_categorie == "Audit de configuration" else "TI"

        audit = Audit(
            reference=f"TI-{annee}-{index + 1:03d}",
            name=f"{prefixe} {libelle}",
            description=f"Campagne {annee} — {libelle}. Périmètre validé avec l'entité commanditaire ({entite}).",
            category_id=categorie.id, priority=priorite, status=statut,
            pilot_id=pilote.id, service_owner_id=responsable.id,
            contact_name=responsable.full_name, contact_email=responsable.email,
            contact_phone="01 23 45 %02d %02d" % (random.randint(10, 99), random.randint(10, 99)),
            prestation_company_id=societe.id if societe else None,
            planned_start=debut, planned_end=fin, actual_start=debut_reel, actual_end=fin_reelle,
            estimated_days=float(duree),
            import_batch_id=MARQUEUR,
        )
        colonne = colonnes.get(statut, colonne_defaut)
        audit.kanban_column_id = colonne.id if colonne else None
        audit.tags = random.sample(list(etiquettes.values()), k=random.randint(1, 3))

        curseur, curseur_reel = debut, debut_reel
        for position, (nom_phase, duree_phase) in enumerate(PHASES):
            fin_phase = curseur + timedelta(days=duree_phase)
            phase_faite = termine or (en_cours and position <= 1)
            phase = AuditPhase(
                name=nom_phase, position=position, start_date=curseur, end_date=fin_phase,
                status=PhaseStatus.TERMINE if phase_faite else PhaseStatus.PLANIFIE,
                confirmed=statut != AuditStatus.BROUILLON and position < 4,
                auditor_id=(random.choice(auditeurs) if position in (1, 2, 3) else pilote).id,
            )
            if phase_faite and curseur_reel:
                phase.actual_start_date = curseur_reel
                phase.actual_end_date = curseur_reel + timedelta(days=duree_phase + random.randint(0, 2))
                curseur_reel = phase.actual_end_date + timedelta(days=1)
            audit.phases.append(phase)
            curseur = fin_phase + timedelta(days=1)

        for position, libelle_prerequis in enumerate(PREREQUIS):
            audit.prerequisites.append(AuditPrerequisite(
                label=libelle_prerequis, is_mandatory=position < 4,
                is_checked=termine or (en_cours and position < 4) or (statut == AuditStatus.PLANIFIE and position < 2),
            ))

        db.add(audit)
        db.flush()

        for cle, valeur in (("application", code_applicatif), ("entite", entite),
                            ("referentiel", random.choice(REFERENTIELS)),
                            ("budget", str(round(duree * random.uniform(1.1, 1.8), 1)))):
            db.add(AuditCustomValue(audit_id=audit.id, field_id=champs[cle].id, value=valeur))

        if termine:
            db.add(Document(
                audit_id=audit.id, filename=f"Rapport_{audit.reference}.pdf",
                stored_filename=f"{audit.id}_rapport.pdf", content_type="application/pdf",
                size_bytes=0, uploaded_by_id=pilote.id,
            ))
        cree += 1

    db.commit()
    print(f"Jeu de démonstration créé pour {annee} : {cree} audits, "
          f"{cree * len(PHASES)} phases, {len(categories)} catégories, {len(etiquettes)} étiquettes, "
          f"{len(societes)} sociétés, {len(pilotes + auditeurs + responsables)} comptes.")
    if mot_de_passe:
        print(f"Comptes de démonstration : <prenom.nom>@{DOMAINE} / mot de passe fourni en option.")
    else:
        print(f"Comptes de démonstration créés sans mot de passe (connexion impossible) : "
              f"utiliser --mot-de-passe pour pouvoir s'y connecter.")
    print("Les documents référencés n'ont pas de fichier associé : leur téléchargement renverra une erreur.")


def main() -> int:
    parseur = argparse.ArgumentParser(
        description="Remplit l'application avec une année type de données de démonstration (fictives).")
    parseur.add_argument("--annee", type=int, default=date.today().year,
                         help="année civile à générer (défaut : année en cours)")
    parseur.add_argument("--audits", type=int, default=28,
                         help="nombre d'audits à créer (défaut : 28)")
    parseur.add_argument("--mot-de-passe", dest="mot_de_passe", default=None,
                         help="mot de passe des comptes de démonstration (défaut : aucun, connexion impossible)")
    parseur.add_argument("--graine", type=int, default=7,
                         help="graine aléatoire, pour un jeu reproductible (défaut : 7)")
    parseur.add_argument("--force", action="store_true",
                         help="ajouter les données même si la base contient déjà des audits")
    parseur.add_argument("--purge", action="store_true",
                         help="retirer les données de démonstration puis quitter")
    options = parseur.parse_args()

    Base.metadata.create_all(bind=engine)
    run_migrations(engine, SessionLocal)

    db = SessionLocal()
    try:
        if options.purge:
            purger(db)
            return 0

        existants = db.query(Audit).count()
        if existants and not options.force:
            print(f"La base contient déjà {existants} audit(s). "
                  f"Relancer avec --force pour ajouter le jeu de démonstration, "
                  f"ou --purge pour retirer un jeu précédent.", file=sys.stderr)
            return 1

        remplir(db, options.annee, max(options.audits, 1), options.mot_de_passe, options.graine)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
