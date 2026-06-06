<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# give me the md file for this feature

Here’s a ready-to-use `donor_pod_assignment.md` file for that feature.

***

# Donor-to-Pod Assignment (PulseNet Matching Rules)

## Overview

Once a donor completes their profile, PulseNet must **assign or suggest** them to the **best-fit Blood Bridge pod** instead of leaving them unlinked.
Each pod represents a thalassemia patient in Hyderabad with a target of **8–10 aligned donors** in their Blood Bridge.

This document defines the data, matching rules, and behaviours for that assignment.

***

## Data Model

### Donor Profile (`donor`)

Mandatory fields:

- `donor_id` (UUID)
- `name`
- `blood_group` (e.g., O+, B−)
- `city` (e.g., Hyderabad)
- `area` / `pincode`
- `preferred_days` (enum/list: weekdays, weekends, specific days)
- `preferred_times` (enum/list: mornings, afternoons, evenings)
- `travel_radius_km` (int)
- `last_donation_date` (date, nullable)
- `languages` (list)
- `status` (active, inactive, unassigned_available)


### Patient Pod (`pod`)

- `pod_id` (UUID)
- `patient_id`
- `patient_blood_group`
- `city` (Hyderabad)
- `treatment_center_location` (lat/long or structured address)
- `cycle_day_pattern` (e.g., every 3 weeks, typical day = Tuesday)
- `current_pod_size` (0–10)
- `active_donors_count`
- `pod_health_score` (0–100)
- `status` (active, paused)


### Donor–Pod Link (`donor_pod`)

- `donor_pod_id` (UUID)
- `donor_id`
- `pod_id`
- `role` (primary, backup)
- `assigned_at` (timestamp)
- `status` (active, removed)

***

## Assignment Flow

### Trigger

- Event: `donor_profile_completed`
- Source: Donor finishes onboarding (web or WhatsApp).

System runs `assign_donor_to_pod(donor_id)` asynchronously.

***

## Step 1 — Filter Candidate Pods

1. **City match**
    - `pod.city == donor.city` (Hyderabad only, for now).
2. **Blood compatibility**
    - `patient_blood_group` compatible with `donor_blood_group`.
    - For now, use exact match + simple compatibility matrix (expand later if needed).
3. **Pod capacity**
    - `pod.current_pod_size < 10`.
4. **Distance constraint**
    - `distance(donor.area, pod.treatment_center_location) <= donor.travel_radius_km`.

All pods that pass these filters become **candidate pods**.

If `candidate_pods` is empty → go to **Fallback**.

***

## Step 2 — Score Candidate Pods

For each `candidate_pod`, compute a `pod_score`.

### Components

- `blood_match_score`
    - Exact blood group match = 1.0
    - Compatible but not exact (e.g., O− → many) = lower weight (e.g., 0.7).
- `proximity_score`
    - Normalize distance to 0–1 range; closer center = higher score.
- `availability_overlap_score`
    - Compare `donor.preferred_days/times` vs `pod.cycle_day_pattern`.
    - Higher score if donor’s preferences align with typical transfusion days.
- `pod_need_score`
    - Higher when:
        - `pod.current_pod_size` is low.
        - `pod.active_donors_count` is low.
        - `pod.pod_health_score` is low.


### Example formula (rule-based v1)

$$
pod\_score = w_1 \cdot blood\_match\_score + w_2 \cdot proximity\_score + w_3 \cdot availability\_overlap\_score + w_4 \cdot pod\_need\_score
$$

Where `w_1 … w_4` are weights (tune later; default equal weights).

***

## Step 3 — Select Best Pod

- Sort `candidate_pods` by `pod_score` descending.
- Let `best_pod` be the first entry.
- If there is a tie, prefer:
    - Pod with lower `current_pod_size`.
    - Then pod with lower `pod_health_score`.

***

## Step 4 — Assignment Behaviour

### Auto-Assign Mode (Default)

- Precondition:
    - Donor has **no existing primary pod**.

Actions:

1. Insert row in `donor_pod`:
    - `donor_id`
    - `pod_id = best_pod.pod_id`
    - `role = "primary"`
    - `assigned_at = now()`
    - `status = "active"`
2. Update pod:
    - `current_pod_size += 1`
    - Recalculate `pod_health_score`.
3. Notify donor:
    - Channel: WhatsApp/SMS.
    - Content (example):
> “You’ve joined a Blood Bridge pod for a fighter at [Center Name] in Hyderabad. Their cycles usually fall on [Day/Time]. We’ll reach out before each cycle if you’re eligible.”
4. Log event:
    - `donor_assigned_to_pod` event stored for audit and analytics.

### Human-in-the-Loop Mode (Optional)

- System generates **top 3** pods with:
    - `pod_id`
    - `score`
    - Reason (e.g., “Closest center, pod has only 4 donors”).
- Admin UI:
    - Shows suggested pods.
    - Coordinator picks 1 (or overrides to a different pod).
- Backend:
    - On approval → same insert/update/notify as auto-assign.

***

## Fallbacks \& Edge Cases

### No Eligible Pod Found

If `candidate_pods` is empty:

- Update donor:
    - `donor.status = "unassigned_available"`.
- Add to “Unassigned Donors (Hyderabad)” admin list.
- Admin can:
    - Use these donors when creating a new patient pod.
    - Use them to refill very weak pods.


### Donor Already in a Pod

Rules:

- Each donor can have:
    - **1 primary pod** (main patient).
    - **0–1 backup pods** (emergency / shared capacity).

When `assign_donor_to_pod` runs:

- If donor has no primary pod → assign as primary.
- If donor has primary but no backup → assign `role = "backup"` if needed for a high-risk patient.
- If donor already has primary + backup:
    - Do not auto-assign.
    - Keep donor in **city-wide emergency pool** only.


### Donor Profile Update

If donor updates:

- area, travel radius, preferred days/times

You may optionally run:

- `recompute_best_pod(donor_id)` and suggest moving pods (admin approval required), or
- only apply changes for future outreach without moving existing pod assignments (simpler).

***

## Future: Model-Based Matching

The above is rule-based v1. Later, you can replace the scoring with a small ML model (SageMaker):

- **Input features**
    - Donor blood group, distance, availability
    - Pod health metrics
    - Donor past response patterns
- **Output**
    - Probability of this donor accepting + showing up for this pod.

Then, `best_pod = argmax(p_accept_show_up)`.

***

## API Sketch (for Devs)

```http
POST /matching/assign-donor
Body:
{
  "donor_id": "UUID"
}

Response:
{
  "status": "assigned",
  "pod_id": "UUID",
  "role": "primary",
  "mode": "auto" | "pending_admin_approval"
}
```

Error / fallback:

```json
{
  "status": "no_eligible_pod",
  "donor_status": "unassigned_available"
}
```


***

This file should live as something like:

`docs/matching/donor_pod_assignment.md`

and be referenced by both backend and AI/ML agents when they implement matching logic.

