from fastapi import FastAPI, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from typing import Literal
import base64
import hashlib
import hmac
import os
import pandas as pd
import io
import secrets
import time
import zipfile
from datetime import datetime, timedelta
from openpyxl.utils.exceptions import InvalidFileException
from xlrd.biffh import XLRDError

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- MODELS ---
class Utilisateur(Base):
    __tablename__ = "utilisateurs"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)
    role = Column(String) 

class VehiculeNomenclature(Base):
    __tablename__ = "vehicules_nomenclatures"
    id = Column(Integer, primary_key=True, index=True)
    projet = Column(String, index=True)
    vehicule = Column(String, index=True)
    version = Column(String, nullable=True)
    ref_tissu = Column(String)
    abr_tissu = Column(String, nullable=True)
    description_tissu = Column(String, nullable=True)
    conso_par_kit = Column(Float)

class TissuSurplus(Base):
    __tablename__ = "tissus_surplus"
    ref_tissu = Column(String, primary_key=True, index=True)
    quantite = Column(Float, default=0.0)

class Demande(Base):
    __tablename__ = "demandes_flux"
    id = Column(Integer, primary_key=True, index=True)
    projet = Column(String)
    vehicule = Column(String)
    quantite_vehicules = Column(Integer)
    is_speciale = Column(Boolean, default=False)
    parent_id = Column(Integer, nullable=True) 
    statut = Column(String, default="Créée")
    date_creation = Column(DateTime, default=datetime.utcnow)
    date_lancement = Column(DateTime, nullable=True)
    date_preparation = Column(DateTime, nullable=True)
    date_reception = Column(DateTime, nullable=True)

class LigneDemande(Base):
    __tablename__ = "lignes_demandes"
    id = Column(Integer, primary_key=True, index=True)
    demande_id = Column(Integer, ForeignKey("demandes_flux.id"))
    ref_tissu = Column(String)
    abr_tissu = Column(String, nullable=True)  # Ajout du champ abr_tissu
    quantite_standard = Column(Float)
    quantite_demandee = Column(Float)
    quantite_preparee = Column(Float, nullable=True)
    quantite_receptionnee = Column(Float, nullable=True)
    statut = Column(String, default="En attente")
    surplus_genere = Column(Float, default=0.0)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Flux Coupe API V13")
bearer_scheme = HTTPBearer(auto_error=False)
active_sessions = {}
PASSWORD_HASH_ITERATIONS = 600000

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PASSWORD_HASH_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PASSWORD_HASH_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode(),
        base64.urlsafe_b64encode(digest).decode(),
    )

def verify_password(password: str, stored_password: str) -> bool:
    if not stored_password.startswith("pbkdf2_sha256$"):
        return hmac.compare_digest(password, stored_password)
    try:
        _, iterations, salt, expected_digest = stored_password.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode(),
            base64.urlsafe_b64decode(salt),
            int(iterations),
        )
        return hmac.compare_digest(
            base64.urlsafe_b64encode(digest).decode(),
            expected_digest,
        )
    except (ValueError, TypeError):
        return False

def require_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentification requise")
    session = active_sessions.get(credentials.credentials)
    user_id = session[0] if session and session[1] > time.time() else None
    if session and user_id is None:
        active_sessions.pop(credentials.credentials, None)
    user = db.query(Utilisateur).filter(Utilisateur.id == user_id).first() if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Session invalide, veuillez vous reconnecter")
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Accès réservé à l'administrateur")
    return user

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    if db.query(Utilisateur).count() == 0:
        db.add_all([
            Utilisateur(username="admin", password="123", role="admin"),
            Utilisateur(username="plani", password="123", role="planificateur"),
            Utilisateur(username="maga", password="123", role="magasinier"),
            Utilisateur(username="coupe", password="123", role="coupeur"),
        ])
        db.commit()
    for user in db.query(Utilisateur).all():
        if user.password and not user.password.startswith("pbkdf2_sha256$"):
            user.password = hash_password(user.password)
    db.commit()
    db.close()

class UserLogin(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str
    password: str
    role: Literal["admin", "planificateur", "magasinier", "coupeur"]

class UserUpdate(BaseModel):
    username: str
    password: str = ""
    role: Literal["admin", "planificateur", "magasinier", "coupeur"]

class NomCreate(BaseModel):
    projet: str
    vehicule: str
    version: str = ""
    ref_tissu: str
    abr_tissu: str = ""
    description_tissu: str = ""
    conso_par_kit: float

class DemandeCreate(BaseModel):
    projet: str
    vehicule: str
    quantite_vehicules: int
    is_speciale: bool

class ActionGlobale(BaseModel):
    action: str

class LigneUpdatePlanificateur(BaseModel):
    quantite_demandee: float

class LigneUpdateMagasinier(BaseModel):
    quantite_preparee: float

class LigneUpdateCoupeur(BaseModel):
    quantite_receptionnee: float

@app.post("/auth/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    u = db.query(Utilisateur).filter(Utilisateur.username == user.username).first()
    if not u or not verify_password(user.password, u.password):
        raise HTTPException(status_code=401, detail="Identifiants invalides")
    if not u.password.startswith("pbkdf2_sha256$"):
        u.password = hash_password(user.password)
        db.commit()
    token = secrets.token_urlsafe(32)
    active_sessions[token] = (u.id, time.time() + 8 * 60 * 60)
    return {"id": u.id, "username": u.username, "role": u.role, "access_token": token}

@app.post("/auth/logout")
def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Authentification requise")
    active_sessions.pop(credentials.credentials, None)
    return {"message": "Déconnexion réussie"}

@app.get("/users/")
def get_users(db: Session = Depends(get_db), _: Utilisateur = Depends(require_admin)):
    users = db.query(Utilisateur).order_by(Utilisateur.id).all()
    return [{"id": user.id, "username": user.username, "role": user.role} for user in users]

@app.post("/users/")
def create_user(user: UserCreate, db: Session = Depends(get_db), _: Utilisateur = Depends(require_admin)):
    username = user.username.strip()
    if not username or len(username) > 80 or not user.password:
        raise HTTPException(status_code=400, detail="Identifiant et mot de passe obligatoires")
    u = Utilisateur(username=username, password=hash_password(user.password), role=user.role)
    db.add(u)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cet identifiant existe déjà")
    return {"message": "Utilisateur créé"}

@app.put("/users/{user_id}")
def update_user(user_id: int, user: UserUpdate, db: Session = Depends(get_db), current_admin: Utilisateur = Depends(require_admin)):
    u = db.query(Utilisateur).filter(Utilisateur.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    username = user.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Identifiant obligatoire")
    if len(username) > 80:
        raise HTTPException(status_code=400, detail="L'identifiant ne peut pas dépasser 80 caractères")
    if u.id == current_admin.id and user.role != "admin":
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas retirer votre propre rôle administrateur")
    if u.role == "admin" and user.role != "admin":
        admin_count = db.query(Utilisateur).filter(Utilisateur.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Impossible de retirer le dernier administrateur")
    u.username = username
    if user.password:
        u.password = hash_password(user.password)
    u.role = user.role
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cet identifiant existe déjà")
    return {"message": "Utilisateur modifié"}

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_admin: Utilisateur = Depends(require_admin)):
    u = db.query(Utilisateur).filter(Utilisateur.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if u.id == current_admin.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas supprimer votre propre compte")
    if u.role == "admin":
        admin_count = db.query(Utilisateur).filter(Utilisateur.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Impossible de supprimer le dernier administrateur")
    db.delete(u)
    db.commit()
    return {"message": "Utilisateur supprimé"}

@app.get("/nomenclatures/all")
def get_all_nomenclatures(db: Session = Depends(get_db)):
    return db.query(VehiculeNomenclature).order_by(VehiculeNomenclature.projet, VehiculeNomenclature.vehicule).all()

@app.post("/nomenclatures/")
def create_nomenclature(nom: NomCreate, db: Session = Depends(get_db)):
    db.add(VehiculeNomenclature(**nom.dict()))
    db.commit()
    return {"message": "Nomenclature ajoutée"}

@app.delete("/nomenclatures/{nom_id}")
def delete_nomenclature(nom_id: int, db: Session = Depends(get_db)):
    nom = db.query(VehiculeNomenclature).filter(VehiculeNomenclature.id == nom_id).first()
    if nom:
        db.delete(nom)
        db.commit()
    return {"message": "Nomenclature supprimée"}

@app.get("/nomenclatures/export")
def export_nomenclatures(db: Session = Depends(get_db)):
    columns = [
        "projet", "vehicule", "version", "ref_tissu",
        "abr_tissu", "description_tissu", "conso_par_kit",
    ]
    nomenclatures = db.query(VehiculeNomenclature).order_by(
        VehiculeNomenclature.projet, VehiculeNomenclature.vehicule
    ).all()
    rows = [{column: getattr(nom, column) for column in columns} for nom in nomenclatures]
    output = io.BytesIO()
    pd.DataFrame(rows, columns=columns).to_excel(output, index=False, engine="openpyxl")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="nomenclatures.xlsx"'},
    )

@app.post("/nomenclatures/upload")
async def upload_nomenclatures(file: UploadFile = File(...), db: Session = Depends(get_db)):
    try:
        filename = (file.filename or "").lower()
        if not filename.endswith((".xlsx", ".xls")):
            raise HTTPException(status_code=400, detail="Veuillez sélectionner un fichier Excel (.xlsx ou .xls).")
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
            
        df.columns = [str(c).strip().lower() for c in df.columns]
        def get_val(row, keys):
            for k in keys:
                if k in row: return row[k] if pd.notna(row[k]) else ""
            return ""

        for _, row in df.iterrows():
            projet = str(get_val(row, ['projet']))
            vehicule = str(get_val(row, ['vehicule']))
            if not projet or not vehicule: continue
            try: conso = float(str(get_val(row, ['conso_par_kit', 'conso'])).replace(',', '.'))
            except ValueError: conso = 0.0

            db.add(VehiculeNomenclature(
                projet=projet, vehicule=vehicule, version=str(get_val(row, ['version'])),
                ref_tissu=str(get_val(row, ['ref.', 'ref-tissu', 'ref_tissu', 'ref', 'reference'])),
                abr_tissu=str(get_val(row, ['abr-tissu', 'abr_tissu', 'abr'])),
                description_tissu=str(get_val(row, ['designation tissu', 'description-tissu', 'description'])),
                conso_par_kit=conso
            ))
        db.commit()
        return {"message": "Import réussi !"}
    except HTTPException:
        db.rollback()
        raise
    except (ValueError, ImportError, zipfile.BadZipFile, InvalidFileException, XLRDError) as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Fichier Excel invalide : {e}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/nomenclatures/projets")
def get_projets(db: Session = Depends(get_db)):
    return [p[0] for p in db.query(VehiculeNomenclature.projet).distinct().all() if p[0]]

@app.get("/nomenclatures/vehicules/{projet}")
def get_vehicules(projet: str, db: Session = Depends(get_db)):
    return [v[0] for v in db.query(VehiculeNomenclature.vehicule).filter(VehiculeNomenclature.projet == projet).distinct().all() if v[0]]

@app.get("/demandes/")
def lister_demandes(db: Session = Depends(get_db)):
    demandes = db.query(Demande).order_by(Demande.date_creation.desc()).all()
    surplus = {s.ref_tissu: s.quantite for s in db.query(TissuSurplus).all()}
    
    res = []
    for d in demandes:
        lignes = db.query(LigneDemande).filter(LigneDemande.demande_id == d.id).order_by(LigneDemande.id).all()
        res.append({
            "id": d.id, "projet": d.projet, "vehicule": d.vehicule, 
            "quantite_vehicules": d.quantite_vehicules, "statut": d.statut,
            "is_speciale": d.is_speciale, "parent_id": d.parent_id,
            "date_creation": d.date_creation.isoformat() if d.date_creation else None,
            "date_lancement": d.date_lancement.isoformat() if d.date_lancement else None,
            "date_preparation": d.date_preparation.isoformat() if d.date_preparation else None,
            "date_reception": d.date_reception.isoformat() if d.date_reception else None,
            "lignes": [{
                "id": l.id, "ref_tissu": l.ref_tissu, "abr_tissu": l.abr_tissu,
                "quantite_standard": round(l.quantite_standard, 3), "quantite_demandee": round(l.quantite_demandee, 3),
                "quantite_preparee": round(l.quantite_preparee, 3) if l.quantite_preparee is not None else None,
                "quantite_receptionnee": round(l.quantite_receptionnee, 3) if l.quantite_receptionnee is not None else None,
                "statut": l.statut, "surplus_disponible": round(surplus.get(l.ref_tissu, 0.0), 3)
            } for l in lignes]
        })
    return res

@app.post("/demandes/")
def creer_demande(demande: DemandeCreate, db: Session = Depends(get_db)):
    db_demande = Demande(projet=demande.projet, vehicule=demande.vehicule, quantite_vehicules=demande.quantite_vehicules, statut="Créée", is_speciale=demande.is_speciale)
    db.add(db_demande)
    db.commit()
    db.refresh(db_demande)
    
    noms = db.query(VehiculeNomenclature).filter(VehiculeNomenclature.projet == demande.projet, VehiculeNomenclature.vehicule == demande.vehicule).all()
    c_map = {}
    a_map = {}
    for n in noms: 
        c_map[n.ref_tissu] = c_map.get(n.ref_tissu, 0) + n.conso_par_kit
        a_map[n.ref_tissu] = n.abr_tissu
            
    for ref, conso in c_map.items():
        std = conso * demande.quantite_vehicules * 1.05
        db.add(LigneDemande(demande_id=db_demande.id, ref_tissu=ref, abr_tissu=a_map.get(ref, ""), quantite_standard=std, quantite_demandee=std))
    db.commit()
    return {"message": "Demande créée"}

@app.delete("/demandes/{demande_id}")
def supprimer_demande(demande_id: int, db: Session = Depends(get_db)):
    demande = db.query(Demande).filter(Demande.id == demande_id).first()
    if not demande: raise HTTPException(status_code=404)
    db.query(LigneDemande).filter(LigneDemande.demande_id == demande_id).delete()
    db.delete(demande)
    db.commit()
    return {"message": "Demande supprimée"}

def gerer_reliquat(demande_id: int, db: Session):
    d = db.query(Demande).filter(Demande.id == demande_id).first()
    lignes = [l for l in db.query(LigneDemande).filter(LigneDemande.demande_id == demande_id).all() if l.quantite_receptionnee is not None and l.quantite_receptionnee < l.quantite_demandee]
    
    if lignes:
        nd = Demande(projet=d.projet, vehicule=f"{d.vehicule} (Reliquat D#{d.id})", quantite_vehicules=0, statut="Créée", is_speciale=True, parent_id=d.id)
        db.add(nd)
        db.flush()
        for l in lignes:
            manque = l.quantite_demandee - l.quantite_receptionnee
            db.add(LigneDemande(demande_id=nd.id, ref_tissu=l.ref_tissu, abr_tissu=l.abr_tissu, quantite_standard=manque, quantite_demandee=manque))
        db.commit()

@app.post("/demandes/{demande_id}/action_globale")
def action_globale(demande_id: int, payload: ActionGlobale, db: Session = Depends(get_db)):
    demande = db.query(Demande).filter(Demande.id == demande_id).first()
    lignes = db.query(LigneDemande).filter(LigneDemande.demande_id == demande_id).all()
    now = datetime.utcnow()
    
    if payload.action == 'lancer':
        demande.statut = "Lancée"
        demande.date_lancement = now
        for l in lignes:
            if l.statut == "En attente": l.statut = "Lancée"
            if demande.is_speciale: l.quantite_standard = l.quantite_demandee
                
    elif payload.action == 'livrer_tout':
        for l in lignes:
            if l.quantite_preparee is None: l.quantite_preparee = l.quantite_demandee
            l.statut = "Préparée"
        demande.statut = "Livrée"
        demande.date_preparation = now
        
    elif payload.action == 'receptionner_tout':
        for l in lignes:
            if l.statut not in ["Réceptionnée", "Partiellement réceptionné", "Non réceptionné"]:
                l.quantite_receptionnee = l.quantite_preparee if l.quantite_preparee is not None else l.quantite_demandee
                l.statut = "Réceptionnée"
                diff = l.quantite_receptionnee - l.quantite_standard
                sr = db.query(TissuSurplus).filter(TissuSurplus.ref_tissu == l.ref_tissu).first()
                if not sr:
                    sr = TissuSurplus(ref_tissu=l.ref_tissu, quantite=0.0)
                    db.add(sr)
                sr.quantite += (diff - l.surplus_genere)
                l.surplus_genere = diff

        statuts = [l.statut for l in lignes]
        if any(s in ['Partiellement réceptionné', 'Non réceptionné'] for s in statuts):
            demande.statut = "Partiellement réceptionnée"
        else:
            demande.statut = "Réceptionnée"
            
        demande.date_reception = now
        db.commit()
        
        if demande.statut == "Partiellement réceptionnée":
            gerer_reliquat(demande.id, db)
        elif demande.statut == "Réceptionnée" and demande.parent_id:
            parent = db.query(Demande).filter(Demande.id == demande.parent_id).first()
            if parent: parent.statut = "Réceptionnée"
        db.commit()

    db.commit()
    return {"message": "Action globale effectuée"}

@app.put("/lignes/{ligne_id}/planificateur")
def update_ligne_planificateur(ligne_id: int, data: LigneUpdatePlanificateur, db: Session = Depends(get_db)):
    l = db.query(LigneDemande).filter(LigneDemande.id == ligne_id).first()
    l.quantite_demandee = data.quantite_demandee
    l.statut = "Modifié"
    db.commit()
    return {"message": "Modifié"}

@app.put("/lignes/{ligne_id}/magasinier")
def update_ligne_magasinier(ligne_id: int, data: LigneUpdateMagasinier, db: Session = Depends(get_db)):
    l = db.query(LigneDemande).filter(LigneDemande.id == ligne_id).first()
    l.quantite_preparee = data.quantite_preparee
    l.statut = "Préparée"
    db.commit()
    return {"message": "Validé"}

@app.put("/lignes/{ligne_id}/coupeur")
def update_ligne_coupeur(ligne_id: int, data: LigneUpdateCoupeur, db: Session = Depends(get_db)):
    ligne = db.query(LigneDemande).filter(LigneDemande.id == ligne_id).first()
    ligne.quantite_receptionnee = data.quantite_receptionnee
    
    if data.quantite_receptionnee == 0: ligne.statut = "Non réceptionné"
    elif data.quantite_receptionnee < ligne.quantite_demandee: ligne.statut = "Partiellement réceptionné"
    else: ligne.statut = "Réceptionnée"
        
    diff = ligne.quantite_receptionnee - ligne.quantite_standard
    sr = db.query(TissuSurplus).filter(TissuSurplus.ref_tissu == ligne.ref_tissu).first()
    if not sr:
        sr = TissuSurplus(ref_tissu=ligne.ref_tissu, quantite=0.0)
        db.add(sr)
    sr.quantite += (diff - ligne.surplus_genere)
    ligne.surplus_genere = diff
    db.commit()
    
    demande = db.query(Demande).filter(Demande.id == ligne.demande_id).first()
    toutes_lignes = db.query(LigneDemande).filter(LigneDemande.demande_id == demande.id).all()
    statuts = [l.statut for l in toutes_lignes]
    
    if not [s for s in statuts if s in ['En attente', 'Lancée', 'Modifié', 'Préparée', 'Livrée']]:
        if any(s in ['Partiellement réceptionné', 'Non réceptionné'] for s in statuts):
            demande.statut = "Partiellement réceptionnée"
        else:
            demande.statut = "Réceptionnée"
        if not demande.date_reception: demande.date_reception = datetime.utcnow()
        db.commit()
        
        if demande.statut == "Partiellement réceptionnée":
            gerer_reliquat(demande.id, db)
        elif demande.statut == "Réceptionnée" and demande.parent_id:
            parent = db.query(Demande).filter(Demande.id == demande.parent_id).first()
            if parent: parent.statut = "Réceptionnée"
            db.commit()
            
    return {"message": "Validé"}

@app.get("/kpi/dashboard")
def get_kpis(period: str = "all", db: Session = Depends(get_db)):
    now = datetime.utcnow()
    date_filter = None
    
    if period == "today": date_filter = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week": date_filter = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "month": date_filter = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "last_month":
        last_day = now.replace(day=1) - timedelta(days=1)
        date_filter = last_day.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_filter = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    q = db.query(Demande).filter(Demande.statut.in_(['Réceptionnée', 'Partiellement réceptionnée']))
    cq = db.query(Demande).filter(Demande.parent_id != None)
    lq = db.query(LigneDemande).join(Demande).filter(LigneDemande.quantite_receptionnee != None)
    
    if period == "last_month":
        q = q.filter(Demande.date_reception >= date_filter, Demande.date_reception < end_filter)
        cq = cq.filter(Demande.date_creation >= date_filter, Demande.date_creation < end_filter)
        lq = lq.filter(Demande.date_reception >= date_filter, Demande.date_reception < end_filter)
    elif date_filter:
        q = q.filter(Demande.date_reception >= date_filter)
        cq = cq.filter(Demande.date_creation >= date_filter)
        lq = lq.filter(Demande.date_reception >= date_filter)

    d_cloturees = q.all()
    partielles = sum(1 for d in d_cloturees if d.statut == 'Partiellement réceptionnée')
    
    lt = [(d.date_reception - d.date_creation).total_seconds() / 60 for d in d_cloturees if d.date_reception and d.date_creation]
    
    return {
        "avg_lead_time_minutes": round(sum(lt)/len(lt), 2) if lt else 0,
        "total_partielles": partielles,
        "total_receptions": len(d_cloturees),
        "metrage_livre": round(sum(l.quantite_receptionnee for l in lq.all()), 2),
        "total_claims": cq.count()
    }
