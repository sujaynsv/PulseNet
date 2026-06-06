Here’s an MD spec you can drop straight into your repo, consistent with your existing API style and the JSON format you shared.

***

# Backup Donor Recommendation API

## Overview

This endpoint recommends **backup donors** for a given patient pod or cycle, using:

- donor–patient matching (blood group, location, pod need), and  
- AI signals (Active Status Model, Eligibility Status Model) where available.

The output is a ranked list of donors that coordinators can add as **backup** to strengthen a pod or cover a specific upcoming transfusion.

***

## Endpoint: Get Recommended Backup Donors

### Path

`GET /api/v1/pods/{pod_id}/recommended-backups`

or (if you want to target a specific cycle):

`GET /api/v1/cycles/{cycle_id}/recommended-backups`

> Choose one style and keep it consistent; this spec assumes `pods/{pod_id}`.

### Description

Returns a list of recommended backup donors for the specified pod, sorted by `match_score` (highest first), with a human-readable `reason` for each recommendation.

### Query parameters (optional)

- `limit` (int, default: 5)  
  Max number of recommended donors to return.

- `only_eligible` (bool, default: true)  
  If true, filters donors using the Eligibility Status Model to those currently predicted as eligible.

- `exclude_existing_pod_members` (bool, default: true)  
  If true, excludes donors who are already part of this pod (primary or backup).

Example:

`GET /api/v1/pods/123/recommended-backups?limit=3&only_eligible=true`

***

## Request Context & Inputs (Server-Side)

The client does not send a body. The server uses existing data:

- **Pod context**:
  - `pod_id`
  - `patient_id`
  - `patient_blood_group`
  - `treatment_center_location`
  - `cycle_day_pattern`
  - `current_pod_size`
  - `pod_health_score`

- **Candidate donors** (from DB):
  - Filtered by blood group compatibility and city = Hyderabad.
  - Exclude current pod members if `exclude_existing_pod_members` is true.

***

## Server-Side Processing Steps

1. **Fetch pod and patient context**
   - `SELECT * FROM pods WHERE pod_id = :pod_id`
   - Load:
     - `patient_blood_group`, `center_location`, `cycle_day_pattern`, `pod_health_score`, etc.

2. **Select candidate donors**
   - Filter donors by:
     - City = Hyderabad
     - Compatible `blood_group`
     - Status = `ACTIVE` (or similar business rule)
   - Additional filters:
     - Exclude donors already in this pod (if `exclude_existing_pod_members`).

3. **Optional AI filters**

   - If `only_eligible = true`:
     - For each candidate donor, call `/api/v1/donors/eligibility-status`.
     - Keep only donors where `eligibility_prediction = "eligible"`.

   - For each remaining candidate donor:
     - Call `/api/v1/donors/active-status` to get `active_probability`.

4. **Compute `match_score`**

   For each candidate donor, compute a score combining:

   - **Base matching** (rule-based):
     - Blood group compatibility
     - Distance between donor and center
     - Availability overlap (preferred days/times vs cycle pattern)
     - Pod need (pods with low health / low donor count get higher weight)

   - **AI signals** (if used):
     - Active Status probability
     - Eligibility Status probability

   Example conceptual formula:

   \[
   match\_score = w_1 \cdot base\_match\_score + w_2 \cdot active\_prob + w_3 \cdot eligibility\_prob
   \]

5. **Generate human-readable `reason`**

   For each donor, build a short explanation string, e.g.:

   - `"High reliability score and optimal distance"`
   - `"Very close proximity despite lower donation frequency"`
   - `"Strong past response rate for this bridge and eligible this week"`

6. **Sort and limit**

   - Sort donors by `match_score` descending.
   - Take top `limit` donors.
   - Map them into the response format.

***

## Response Format

### Status codes

- `200 OK` – Successful response with recommendations.
- `404 Not Found` – Pod not found.
- `500 Internal Server Error` – Unexpected error.

### Body (JSON)

```json
{
  "pod_id": 123,
  "recommended_backups": [
    {
      "donor_id": 105,
      "match_score": 0.95,
      "reason": "High reliability score and optimal distance"
    },
    {
      "donor_id": 210,
      "match_score": 0.82,
      "reason": "Very close proximity despite lower donation frequency"
    }
  ],
  "generated_at": "2026-06-07T00:35:00Z",
  "model_versions": {
    "active_status_model": "active_status_model_v1",
    "eligibility_status_model": "eligibility_status_model_v1"
  }
}
```

- `pod_id`  
  The pod for which recommendations were generated.

- `recommended_backups[]`  
  - `donor_id` – numeric or string ID of the donor.
  - `match_score` – float between 0 and 1 (or 0–100, but be consistent).
  - `reason` – brief text explaining why this donor is recommended.

- `generated_at`  
  ISO timestamp of when this list was produced.

- `model_versions` (optional but useful for audit)  
  Shows which model versions were used, if AI models are involved.

***

## Usage in the PulseNet App

### Admin UI

- In the **Pod Command Center**, for a weak pod:
  - Show a button: `Suggest backup donors`.
  - Call this endpoint.
  - Render the `recommended_backups` as a list with:
    - Donor ID / basic info (from another API).
    - `match_score` as a percentage.
    - `reason` as a subtitle.

- Action:
  - Admin can click `Add to pod` next to each recommended donor.
  - That triggers a separate endpoint:
    - `POST /api/v1/pods/{pod_id}/add-donor` with `{ donor_id, role: "backup" }`.

### Logging / Analytics

- Each time this endpoint is called, log:
  - `pod_id`
  - number of candidates considered
  - number of recommendations returned

This helps you evaluate how well the recommendation pipeline is performing.

***

## Notes for Implementation

- Implement this controller in the same service that already exposes:
  - `/api/v1/donors/active-status`
  - `/api/v1/donors/eligibility-status`
- Reuse existing:
  - donor selection logic (blood group + city),
  - distance calculations,
  - and feature engineering utilities.

***

Save this as something like:

`docs/api/backup_donor_recommendations.md`

and link it from your main PulseNet API index so the agents and jury see clearly how backup suggestions are generated and exposed.