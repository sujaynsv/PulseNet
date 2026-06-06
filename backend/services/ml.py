"""
PulseNet — ML Inference Service
=================================
Placeholder for the XGBoost donor ranking model.
Branch `feature/admin-ai` should replace the mock with real model loading.

The ranking model predicts a "reliability score" for each candidate donor
given their engagement metrics from the dataset:
  - calls_to_donations_ratio  (lower = better donor effort per call)
  - eligibility_status        (eligible = 1, not eligible = 0)
  - user_donation_active_status (Active = 1)
  - donations_till_date
  - frequency_in_days
  - cycle_of_donations
  - donated_earlier (bridge-specific)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Model loading ─────────────────────────────────────────────────────────────
# When the trained model is available, drop `xgboost_model.pkl` into /services/
# and uncomment the joblib.load lines below.

MODEL_PATH = Path(__file__).parent / "xgboost_model.pkl"
ACTIVE_MODEL_PATH = Path(__file__).parent / "models" / "active_status_model.pkl"
ELIGIBILITY_MODEL_PATH = Path(__file__).parent / "models" / "eligibility_status_model.pkl"

_model: Optional[Any] = None
_active_model: Optional[Any] = None
_eligibility_model: Optional[Any] = None

def _load_model() -> Optional[Any]:
    global _model
    if _model is not None:
        return _model
    if MODEL_PATH.exists():
        import joblib  # noqa: PLC0415
        _model = joblib.load(MODEL_PATH)
        logger.info("✅ XGBoost model loaded from %s", MODEL_PATH)
    else:
        logger.warning(
            "⚠️  XGBoost model not found at %s — using heuristic fallback scorer.",
            MODEL_PATH,
        )
    return _model

def _load_active_model() -> Optional[Any]:
    global _active_model
    if _active_model is not None:
        return _active_model
    if ACTIVE_MODEL_PATH.exists():
        try:
            import joblib
            _active_model = joblib.load(ACTIVE_MODEL_PATH)
            logger.info("✅ Active Status model loaded from %s", ACTIVE_MODEL_PATH)
        except Exception as e:
            logger.error("⚠️ Failed to load Active Status model from %s: %s", ACTIVE_MODEL_PATH, e)
    return _active_model

def _load_eligibility_model() -> Optional[Any]:
    global _eligibility_model
    if _eligibility_model is not None:
        return _eligibility_model
    if ELIGIBILITY_MODEL_PATH.exists():
        try:
            import joblib
            _eligibility_model = joblib.load(ELIGIBILITY_MODEL_PATH)
            logger.info("✅ Eligibility Status model loaded from %s", ELIGIBILITY_MODEL_PATH)
        except Exception as e:
            logger.error("⚠️ Failed to load Eligibility Status model from %s: %s", ELIGIBILITY_MODEL_PATH, e)
    return _eligibility_model


def _heuristic_score(donor: Dict[str, Any]) -> float:
    """
    Deterministic heuristic score used when model file is absent.
    Higher = better candidate.  Range: 0.0 – 1.0
    """
    score = 0.5

    # Reward eligibility
    if donor.get("eligibility_status") == "eligible":
        score += 0.2

    # Reward active donation status
    if donor.get("user_donation_active_status") == "Active":
        score += 0.15

    # Reward prior bridge donation
    if donor.get("donated_earlier"):
        score += 0.10

    # Penalise high calls-to-donations ratio (donor fatigue indicator)
    ratio = donor.get("calls_to_donations_ratio") or 0.0
    if ratio > 10:
        score -= 0.2
    elif ratio > 5:
        score -= 0.1

    return round(min(max(score, 0.0), 1.0), 4)


def _heuristic_active_score(donor: Dict[str, Any]) -> float:
    score = 0.5
    status = donor.get("user_donation_active_status")
    if status and str(status).lower() == "active":
        score += 0.3
    if donor.get("donations_till_date") and donor.get("donations_till_date") > 2:
        score += 0.1
    return round(min(score, 1.0), 4)


def _heuristic_eligibility_score(donor: Dict[str, Any]) -> float:
    score = 0.5
    status = donor.get("eligibility_status")
    if status and str(status).lower() == "eligible":
        score += 0.4
    return round(min(score, 1.0), 4)


def predict_active_status(donor: Dict[str, Any]) -> float:
    model = _load_active_model()
    if model is not None:
        try:
            import pandas as pd
            df = pd.DataFrame([donor])
            prob = float(model.predict_proba(df)[0][1])
            print(f"ACTIVE MODEL PROB: {prob}")
            return prob
        except Exception as e:
            logger.error("Active status model failed: %s", e)
            print(f"ACTIVE MODEL FAILED: {e}")
            return _heuristic_active_score(donor)
    return _heuristic_active_score(donor)


def predict_eligibility_status(donor: Dict[str, Any]) -> float:
    model = _load_eligibility_model()
    if model is not None:
        try:
            import pandas as pd
            df = pd.DataFrame([donor])
            prob = float(model.predict_proba(df)[0][1])
            print(f"ELIGIBILITY MODEL PROB: {prob}")
            return prob
        except Exception as e:
            logger.error("Eligibility status model failed: %s", e)
            print(f"ELIGIBILITY MODEL FAILED: {e}")
            return _heuristic_eligibility_score(donor)
    return _heuristic_eligibility_score(donor)


def rank_donors(donors: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Rank a list of candidate donor dictionaries.
    """
    model = _load_model()

    for donor in donors:
        if model is not None:
            # Real inference path
            try:
                import pandas as pd
                df = pd.DataFrame([donor])
                donor["ml_rank_score"] = float(model.predict_proba(df)[0][1])
            except:
                donor["ml_rank_score"] = _heuristic_score(donor)
        else:
            donor["ml_rank_score"] = _heuristic_score(donor)

    donors.sort(key=lambda d: d.get("ml_rank_score", 0.0), reverse=True)
    return donors
