from sqlalchemy import create_engine, text
import json

URL = "postgresql://pulsenet_user:pulsenetSecure123!@pulsenet-db.cmbgewm8qzmy.us-east-1.rds.amazonaws.com:5432/postgres"
engine = create_engine(URL)

with engine.connect() as conn:
    result = conn.execute(text("SELECT id, patient_id FROM bridges LIMIT 1"))
    pod = result.fetchone()
    pod_id = pod.id
    patient_id = pod.patient_id
    
    result = conn.execute(text("SELECT blood_group FROM users WHERE id = :pid"), {"pid": patient_id})
    patient_bg = result.fetchone()[0]
    
    print(f"Testing Pod {pod_id}, Patient BG: '{patient_bg}'")
    
    result = conn.execute(text("SELECT donor_id FROM bridge_members WHERE bridge_id = :bid"), {"bid": pod_id})
    existing_members = [r[0] for r in result.fetchall()]
    print(f"Existing members in pod: {existing_members}")
    
    if existing_members:
        # PostgreSQL syntax for NOT IN with list
        query = text("""
            SELECT id, eligibility_status, user_donation_active_status 
            FROM users 
            WHERE role = 'Donor' AND blood_group = :bg AND id != ALL(:existing)
        """)
        result = conn.execute(query, {"bg": patient_bg, "existing": existing_members})
    else:
        query = text("""
            SELECT id, eligibility_status, user_donation_active_status 
            FROM users 
            WHERE role = 'Donor' AND blood_group = :bg
        """)
        result = conn.execute(query, {"bg": patient_bg})
        
    candidates = result.fetchall()
    print(f"Found {len(candidates)} candidates after excluding existing members.")
