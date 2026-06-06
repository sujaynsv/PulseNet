"""
PulseNet — SQLAlchemy 2.0 Models
===================================
Tables:
  users            → donors and patients (role column differentiates)
  bridges          → one bridge per patient (8 donor slots)
  bridge_members   → the 8 donor↔bridge relationships (cycle position 1-8)
  transfusion_logs → every completed transfusion event

All columns mapped directly from Dataset.csv + extended for the platform.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func
# Trigger reload

from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


# ── User (Donor OR Patient) ───────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Link to AWS Cognito identity (populated on first login / registration)
    cognito_sub: Mapped[Optional[str]] = mapped_column(String(128), unique=True, nullable=True, index=True)

    # Core identity
    external_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    role: Mapped[str] = mapped_column(String(16))   # "Donor" | "Patient" | "Admin"
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)   # +91XXXXXXXXXX

    # Demographics (from Dataset.csv)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    blood_group: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Donor-specific columns (from Dataset.csv)
    eligibility_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)   # "eligible" | "not eligible"
    user_donation_active_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)  # "Active" | "Inactive"
    calls_to_donations_ratio: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    donations_till_date: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_donation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_eligible_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)  # last_donation + 90 days
    frequency_in_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    inactive_trigger_comment: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    # Added columns for complete Donor Flow (Flow 1)
    locality: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    preferred_center: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    contact_preference: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    general_availability: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    bridge_preference: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True)
    travel_radius: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    languages: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    medical_notes: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)

    # Patient-specific columns
    expected_next_transfusion_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    transfusion_frequency_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=18)
    clinical_alert: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    hb_decline_flag: Mapped[bool] = mapped_column(Boolean, default=False)

    # Account status
    status: Mapped[str] = mapped_column(String(16), default="active")
    registration_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    bridge_memberships: Mapped[list["BridgeMember"]] = relationship(
        "BridgeMember", foreign_keys="BridgeMember.donor_id", back_populates="donor"
    )
    patient_bridge: Mapped[Optional["Bridge"]] = relationship(
        "Bridge", foreign_keys="Bridge.patient_id", back_populates="patient", uselist=False
    )
    transfusion_logs: Mapped[list["TransfusionLog"]] = relationship(
        "TransfusionLog", back_populates="donor", foreign_keys="TransfusionLog.donor_id"
    )


# ── Blood Bridge (one per patient, holds 8 donor slots) ──────────────────────

class Bridge(Base):
    __tablename__ = "bridges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_bridge_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)

    # The patient this bridge serves
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    blood_group_required: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    bridge_status: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    patient: Mapped["User"] = relationship("User", foreign_keys=[patient_id], back_populates="patient_bridge")
    members: Mapped[list["BridgeMember"]] = relationship(
        "BridgeMember", back_populates="bridge", order_by="BridgeMember.cycle_position"
    )


# ── Bridge Member (one of 8 cycle slots) ─────────────────────────────────────

class BridgeMember(Base):
    __tablename__ = "bridge_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    bridge_id: Mapped[int] = mapped_column(ForeignKey("bridges.id"))
    donor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    # Position in the 8-person rotation (1-8)
    cycle_position: Mapped[int] = mapped_column(Integer, default=1)
    
    # Is this donor a backup donor for the pod?
    is_backup: Mapped[bool] = mapped_column(Boolean, default=False)

    # Donation tracking for this slot
    donated_earlier: Mapped[bool] = mapped_column(Boolean, default=False)
    last_donation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    expected_next_donation_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Status of this slot
    slot_status: Mapped[str] = mapped_column(String(16), default="Active")  # Active | Due | Overdue | Inactive

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    bridge: Mapped["Bridge"] = relationship("Bridge", back_populates="members")
    donor: Mapped["User"] = relationship("User", foreign_keys=[donor_id], back_populates="bridge_memberships")


# ── Transfusion Log ───────────────────────────────────────────────────────────

class TransfusionLog(Base):
    __tablename__ = "transfusion_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    donor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    bridge_id: Mapped[Optional[int]] = mapped_column(ForeignKey("bridges.id"), nullable=True)

    transfusion_date: Mapped[date] = mapped_column(Date)
    blood_units: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    pretransfusion_hb: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    hospital: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="completed")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    donor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[donor_id], back_populates="transfusion_logs")


# ── Cycle (Recurring schedule for a patient) ─────────────────────────────────

class Cycle(Base):
    __tablename__ = "cycles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_cycle_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    due_date: Mapped[date] = mapped_column(Date)
    expected_units: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="routine")  # pending, routine, at_risk, emergency, fulfilled
    confidence_score: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

# ── Requirement (Triggered event for a cycle) ────────────────────────────────

class Requirement(Base):
    __tablename__ = "requirements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    external_requirement_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    cycle_id: Mapped[Optional[int]] = mapped_column(ForeignKey("cycles.id"), nullable=True)
    
    trigger_type: Mapped[str] = mapped_column(String(32))  # scheduled, patient_request, emergency
    severity: Mapped[str] = mapped_column(String(32), default="routine")  # routine, at_risk, emergency
    source: Mapped[str] = mapped_column(String(32), default="system")  # system, patient, coordinator
    status: Mapped[str] = mapped_column(String(32), default="matching")  # pending_verification, matching, covered, fulfilled, unresolved
    
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

# ── RequirementResponse (Donor confirmation mapping) ─────────────────────────

class RequirementResponse(Base):
    __tablename__ = "requirement_responses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    requirement_id: Mapped[int] = mapped_column(ForeignKey("requirements.id"))
    donor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(32), default="pending")  # pending, confirmed, declined
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


# ── Emergency Case (Full resolution workflow tracker) ─────────────────────────

class EmergencyCase(Base):
    __tablename__ = "emergency_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)

    # Patient info
    patient_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    patient_label: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # masked or name
    blood_group: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    center_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    units_needed: Mapped[int] = mapped_column(Integer, default=2)
    time_critical_by: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Assigned donor (optional)
    assigned_donor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    # 5-step resolution checklist
    donor_assigned: Mapped[bool] = mapped_column(Boolean, default=False)
    donor_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    center_informed: Mapped[bool] = mapped_column(Boolean, default=False)
    units_arranged: Mapped[bool] = mapped_column(Boolean, default=False)
    case_closed: Mapped[bool] = mapped_column(Boolean, default=False)

    # Overall status: open | partially_covered | closed
    status: Mapped[str] = mapped_column(String(32), default="open")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    patient: Mapped[Optional["User"]] = relationship("User", foreign_keys=[patient_id])
    assigned_donor: Mapped[Optional["User"]] = relationship("User", foreign_keys=[assigned_donor_id])
