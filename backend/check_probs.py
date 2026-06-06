import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.ml import predict_active_status, predict_eligibility_status

donor = {
    "user_donation_active_status": "Active",
    "eligibility_status": "eligible",
    "donations_till_date": 3,
    "calls_to_donations_ratio": 1.5,
    "donated_earlier": 1,
    "frequency_in_days": 120,
    "cycle_of_donations": 1,
}

print("Active Prob:", predict_active_status(donor))
print("Eligibility Prob:", predict_eligibility_status(donor))
