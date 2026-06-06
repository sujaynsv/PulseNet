"""
PulseNet — SQLAlchemy 2.0 Database Models
==========================================
All columns mapped directly from Dataset.csv columns.
Uses `Mapped` + `mapped_column` declarative syntax (SA 2.0).

Entities:
  - User        → Unified identity (donor or patient)
  - Bridge      → Blood Bridge linking a patient to a set of donors
  - BridgeMember → Join table: User ↔ Bridge with donor-specific metrics
  - TransfusionLog → Historical record of each transfusion event
"""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ── Enumerations (mirrors Dataset.csv value sets) ─────────────────────────────

class RoleEnum(str):
    BRIDGE_DONOR = "Bridge Donor"
    EMERGENCY_DONOR = "Emergency Donor"
    VOLUNTEER = "Volunteer"


class BloodGroupEnum(str):
    A_POS = "A Positive"
    A_NEG = "A Negative"
    B_POS = "B Positive"
    B_NEG = "B Negative"
    AB_POS = "AB Positive"
    AB_NEG = "AB Negative"
    O_POS = "O Positive"
    O_NEG = "O Negative"


class DonorTypeEnum(str):
    ONE_TIME = "One-Time Donor"
    REGULAR = "Regular Donor"
    OTHER = "Other"


# ── User model ────────────────────────────────────────────────────────────────

class User(Base):
    """
    Unified user entity representing both donors and patients.
    Maps to: user_id, blood_group, gender, latitude, longitude,
             registration_date, role, role_status, status columns.
    """
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Hashed external ID from dataset (hex prefix `\x…`)
    external_id: Mapped[str] = mapped_column(String(256), unique=True, nullable=False, index=True)

    # Demographics
    blood_group: Mapped[Optional[str]] = mapped_column(String(20))
    gender: Mapped[Optional[str]] = mapped_column(String(10))
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)

    # Role (from dataset: Bridge Donor / Emergency Donor / Volunteer)
    role: Mapped[Optional[str]] = mapped_column(String(50))
    role_status: Mapped[bool] = mapped_column(Boolean, default=True)

    # Donor classification
    donor_type: Mapped[Optional[str]] = mapped_column(String(50))

    # Contact / engagement metrics
    last_contacted_date: Mapped[Optional[date]] = mapped_column(Date)
    last_donation_date: Mapped[Optional[date]] = mapped_column(Date)
    next_eligible_date: Mapped[Optional[date]] = mapped_column(Date)
    donations_till_date: Mapped[Optional[int]] = mapped_column(Integer, default=0)

    # Eligibility (from dataset: eligible / not eligible)
    eligibility_status: Mapped[Optional[str]] = mapped_column(String(30))

    # Donor cycle metrics (directly from dataset)
    cycle_of_donations: Mapped[Optional[int]] = mapped_column(Integer)
    total_calls: Mapped[Optional[int]] = mapped_column(Integer, default=0)
    frequency_in_days: Mapped[Optional[int]] = mapped_column(Integer)
    calls_to_donations_ratio: Mapped[Optional[float]] = mapped_column(Numeric(6, 2))

    # Activity status (Active / Inactive)
    user_donation_active_status: Mapped[Optional[str]] = mapped_column(String(20))
    inactive_trigger_comment: Mapped[Optional[str]] = mapped_column(Text)

    # Account status (active / suspended)
    status: Mapped[str] = mapped_column(String(20), default="active")

    # Phone / email for notification (not in dataset but needed for comms)
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(120))
    name: Mapped[Optional[str]] = mapped_column(String(120))

    # Timestamps
    registration_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    bridge_memberships: Mapped[List["BridgeMember"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    transfusion_logs: Mapped[List["TransfusionLog"]] = relationship(
        back_populates="patient", cascade="all, delete-orphan"
    )


# ── Bridge model ──────────────────────────────────────────────────────────────

class Bridge(Base):
    """
    A Blood Bridge groups a patient with a pool of committed donors.
    Maps to: bridge_id, bridge_status, bridge_blood_group, bridge_gender,
             quantity_required columns.
    """
    __tablename__ = "bridges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    external_bridge_id: Mapped[str] = mapped_column(String(256), unique=True, nullable=False, index=True)

    # Patient this bridge serves
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Bridge configuration (from dataset)
    bridge_blood_group: Mapped[Optional[str]] = mapped_column(String(20))
    bridge_gender: Mapped[Optional[str]] = mapped_column(String(10))
    quantity_required: Mapped[Optional[int]] = mapped_column(Integer, default=1)

    # Transfusion schedule (from dataset)
    last_transfusion_date: Mapped[Optional[date]] = mapped_column(Date)
    expected_next_transfusion_date: Mapped[Optional[date]] = mapped_column(Date)

    # Status flags (from dataset)
    bridge_status: Mapped[bool] = mapped_column(Boolean, default=True)
    status_of_bridge: Mapped[bool] = mapped_column(Boolean, default=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    patient: Mapped["User"] = relationship(foreign_keys=[patient_id])
    members: Mapped[List["BridgeMember"]] = relationship(
        back_populates="bridge", cascade="all, delete-orphan"
    )
    transfusion_logs: Mapped[List["TransfusionLog"]] = relationship(
        back_populates="bridge", cascade="all, delete-orphan"
    )


# ── BridgeMember model ────────────────────────────────────────────────────────

class BridgeMember(Base):
    """
    Join table: donor User ↔ Bridge.
    Captures per-donor metrics that influence the XGBoost ranking model.
    Maps to: donated_earlier, last_bridge_donation_date, status_of_bridge,
             user_donation_active_status columns.
    """
    __tablename__ = "bridge_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bridge_id: Mapped[int] = mapped_column(ForeignKey("bridges.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    # Whether this donor has donated for this specific bridge before
    donated_earlier: Mapped[bool] = mapped_column(Boolean, default=False)
    last_bridge_donation_date: Mapped[Optional[date]] = mapped_column(Date)

    # Ranking score produced by XGBoost (placeholder: populated by /services/ml.py)
    ml_rank_score: Mapped[Optional[float]] = mapped_column(Float)

    # Timestamps
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    bridge: Mapped["Bridge"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="bridge_memberships")


# ── TransfusionLog model ──────────────────────────────────────────────────────

class TransfusionLog(Base):
    """
    Tracks every completed transfusion event for a patient.
    Used to compute upcoming transfusion dates and historical patterns.
    """
    __tablename__ = "transfusion_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    patient_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    bridge_id: Mapped[Optional[int]] = mapped_column(ForeignKey("bridges.id"))
    donor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))

    transfusion_date: Mapped[date] = mapped_column(Date, nullable=False)
    units: Mapped[int] = mapped_column(Integer, default=1)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    patient: Mapped["User"] = relationship(
        foreign_keys=[patient_id], back_populates="transfusion_logs"
    )
    bridge: Mapped[Optional["Bridge"]] = relationship(back_populates="transfusion_logs")
