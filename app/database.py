"""Database engine, session management, and migrations for SmartSchedule AI 3.0."""
import os
import sqlite3
from pathlib import Path
from contextlib import contextmanager
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from app.config import settings, ROOT_DIR
from app.models import Base

def get_engine_and_url():
    raw_url = os.getenv("DATABASE_URL") or os.getenv("SMARTSCHEDULE_DB") or f"sqlite:///{ROOT_DIR / 'smartschedule.db'}"
    if not ("://" in raw_url):
        # Raw file path supplied (e.g. from tests or SMARTSCHEDULE_DB)
        db_url = f"sqlite:///{raw_url}"
    else:
        db_url = raw_url

    if db_url.startswith("sqlite:///"):
        filepath = db_url.replace("sqlite:///", "")
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        eng = create_engine(
            db_url,
            connect_args={"check_same_thread": False, "timeout": 15}
        )
    else:
        eng = create_engine(db_url, pool_pre_ping=True)
    return eng, db_url

engine, db_url = get_engine_and_url()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    global engine, SessionLocal
    engine, _ = get_engine_and_url()
    SessionLocal.configure(bind=engine)
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@contextmanager
def conn():
    """Backward-compatible raw connection context manager for existing tests and utilities."""
    raw_target = os.getenv("DATABASE_URL") or os.getenv("SMARTSCHEDULE_DB") or f"sqlite:///{ROOT_DIR / 'smartschedule.db'}"
    if not ("://" in raw_target):
        filepath = raw_target
    elif raw_target.startswith("sqlite:///"):
        filepath = raw_target.replace("sqlite:///", "")
    else:
        filepath = None

    if filepath:
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        raw_db = sqlite3.connect(filepath, timeout=10)
        raw_db.row_factory = sqlite3.Row
        raw_db.execute('PRAGMA busy_timeout=10000')
        raw_db.execute('PRAGMA foreign_keys=ON')
        try:
            yield raw_db
            raw_db.commit()
        except Exception:
            raw_db.rollback()
            raise
        finally:
            raw_db.close()
    else:
        connection = engine.raw_connection()
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

def migrate_existing_tables():
    """Safely migrate existing tables by adding missing columns without dropping data."""
    with engine.connect() as connection:
        inspector = inspect(engine)
        existing_tables = inspector.get_table_names()

        if "appointments" in existing_tables:
            columns = [c["name"] for c in inspector.get_columns("appointments")]
            new_cols = [
                ("user_id", "INTEGER"),
                ("risk_score", "FLOAT DEFAULT 0.0"),
                ("risk_tier", "VARCHAR(20) DEFAULT 'Low'"),
                ("risk_factors_json", "TEXT DEFAULT '[]'"),
                ("slot_score", "FLOAT DEFAULT 0.0")
            ]
            for col_name, col_type in new_cols:
                if col_name not in columns:
                    try:
                        connection.execute(text(f"ALTER TABLE appointments ADD COLUMN {col_name} {col_type}"))
                        connection.commit()
                    except Exception:
                        pass

def seed_defaults():
    """Seed initial staff, services, and default admin if they don't exist."""
    from app.models import Staff, Service, User
    from app.security import hash_password
    import json

    db: Session = SessionLocal()
    try:
        # Default Admin
        if not db.query(User).filter_by(email="admin@smartschedule.local").first():
            admin_user = User(
                email="admin@smartschedule.local",
                full_name="System Administrator",
                hashed_password=hash_password("AdminPass123!"),
                role="admin",
                is_active=True
            )
            db.add(admin_user)

        # Default Staff User
        if not db.query(User).filter_by(email="staff.a@smartschedule.local").first():
            staff_user = User(
                email="staff.a@smartschedule.local",
                full_name="Staff A (Advising)",
                hashed_password=hash_password("StaffPass123!"),
                role="staff",
                is_active=True
            )
            db.add(staff_user)

        # Default Customer User
        if not db.query(User).filter_by(email="student@example.org").first():
            cust_user = User(
                email="student@example.org",
                full_name="Demo Student",
                hashed_password=hash_password("CustomerPass123!"),
                role="customer",
                is_active=True
            )
            db.add(cust_user)

        # Initial Staff records
        default_staff = [
            ("Staff A", "staff.a@smartschedule.local", "Academic Advising"),
            ("Staff B", "staff.b@smartschedule.local", "Career Services"),
            ("Staff C", "staff.c@smartschedule.local", "Student Support"),
            ("Staff D", "staff.d@smartschedule.local", "Technical Support"),
            ("Staff E", "staff.e@smartschedule.local", "Document Verification")
        ]
        for name, email, dept in default_staff:
            if not db.query(Staff).filter_by(name=name).first():
                st = Staff(
                    name=name,
                    email=email,
                    department=dept,
                    working_hours_json=json.dumps({
                        "start": "09:00",
                        "end": "17:00",
                        "break_start": "13:00",
                        "break_end": "14:00",
                        "days": [1, 2, 3, 4, 5]
                    }),
                    max_daily_appointments=8,
                    is_active=True
                )
                db.add(st)

        # Initial Services
        default_services = [
            ("Consultation", 30, 10, "Initial general advising consultation", 1.0),
            ("Academic Advising", 45, 15, "Curriculum, credit check and graduation planning", 1.2),
            ("Support Session", 30, 10, "Student guidance and counseling support", 1.0),
            ("Document Verification", 15, 5, "Official degree and identity record verification", 0.8),
            ("Career Mentorship", 60, 15, "Resume critique and interview preparation", 1.3),
            ("Financial Aid Advising", 45, 10, "Grants, scholarship, and student aid assistance", 1.1)
        ]
        for name, dur, buf, desc, weight in default_services:
            if not db.query(Service).filter_by(name=name).first():
                srv = Service(
                    name=name,
                    duration_minutes=dur,
                    buffer_minutes=buf,
                    description=desc,
                    priority_weight=weight,
                    is_active=True
                )
                db.add(srv)

        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Seed note: {e}")
    finally:
        db.close()

def init_db():
    """Initializes tables, migrates columns, and seeds initial data."""
    global engine, SessionLocal
    engine, _ = get_engine_and_url()
    SessionLocal.configure(bind=engine)
    Base.metadata.create_all(bind=engine)
    migrate_existing_tables()
    seed_defaults()

