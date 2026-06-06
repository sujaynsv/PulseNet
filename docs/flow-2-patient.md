# Blood Warriors Flow 2 — Patient

## Purpose
This document captures the final patient-side flow for a Hyderabad-first Blood Warriors system. It is intended for a coding agent and models the product as a predictive transfusion continuity system rather than a simple emergency blood request tool.[cite:187][cite:189]

## Scope
- Active city: Hyderabad.[cite:188][cite:187]
- Focus: transfusion-dependent thalassemia patients.
- Patients are typically onboarded through coordinator or partner identification rather than open self-service discovery.[cite:189]
- The patient flow must support recurring transfusions, bridge donor assignment, confidence scoring, early risk detection, emergency escalation, and caregiver reassurance.

## Clinical grounding
Transfusion-dependent thalassemia is managed through regular planned transfusions, often every 2–5 weeks depending on patient profile, with many guidance sources noting fixed, advance scheduling and common recurring intervals around 3–4 weeks.[cite:206][cite:183][cite:204][cite:211]

## Product model
The patient side should not begin only when an emergency request is raised. Instead, the system should represent each patient as a longitudinal care entity with:
- recurring transfusion calendar,
- dedicated donor pod,
- live coverage confidence,
- escalation pathways,
- post-transfusion clinical and operational history.

## Flow overview
1. Patient is onboarded.
2. Care profile is created.
3. Blood Bridge pod is created.
4. Recurring transfusion calendar is generated.
5. Requirement events are activated from schedule or manual trigger.
6. Confidence score is calculated for each upcoming cycle.
7. If covered, cycle proceeds normally.
8. If weak, auto-repair starts.
9. If still weak, emergency escalation happens.
10. Transfusion occurs.
11. Post-transfusion data is logged.
12. Hb trend and cycle continuity intelligence feed future planning.

## Detailed flow

### 1. Patient onboarding
Patient entry should typically happen through Blood Warriors coordinators, hospitals, offline patient lists, or partner networks. Blood Warriors’ public mission and programs are built around supporting thalassemia patients through coordinated systems rather than purely ad hoc public intake.[cite:189][cite:198]

Create patient profile with:
- patient_id
- anonymized_display_name
- age
- gender
- diagnosis / condition category
- blood_group
- city = Hyderabad
- treatment_center
- caregiver_name
- caregiver_contact
- standard_transfusion_frequency_days
- expected_units_per_cycle
- target_pretransfusion_hb
- current_status

### 2. Pod creation
For each patient, create a dedicated Blood Bridge pod made up of matched donors. Blood Warriors publicly describes Blood Bridge as a model where one patient is connected to a committed donor set, typically around 10 donors who rotate support.[cite:215][cite:198]

Pod fields:
- patient_pod_id
- patient_id
- donor_ids
- minimum_operating_donor_count
- ideal_donor_count
- health_score
- city
- center_id

Default ideal donor count may be around 8–10, but it should be configurable upward for heavier transfusion demand or difficult groups.[cite:215]

### 3. Recurring transfusion calendar
Generate a 3-month or rolling calendar based on fixed interval planning. Transfusions for thalassemia are generally scheduled in advance and maintained at regular intervals.[cite:204][cite:211][cite:207]

Each cycle record should contain:
- cycle_id
- patient_id
- due_date
- expected_units
- severity_state
- confidence_score
- status

### 4. Requirement trigger model
Each cycle should produce a requirement event. Requirement events can be triggered in three ways:

#### Scheduled trigger
The default trigger. When an upcoming cycle enters activation window, such as T minus 7 or T minus 10 days, create a routine requirement event automatically.[cite:204][cite:213]

#### Patient or caregiver request trigger
The parent or caregiver may raise a request through portal or chatbot. Blood Warriors publicly supports emergency request submission and current operational reality includes patient-side request initiation through portal/chatbot flows.[cite:187][cite:191]

#### Emergency/manual trigger
Coordinator, hospital, or system may escalate when coverage is collapsing or urgency is clinically high.[cite:191]

### 5. Confidence score
For each active upcoming cycle, compute a Transfusion Confidence Score. This is the main product intelligence layer.

Inputs may include:
- number of confirmed donors,
- number of currently eligible donors in pod,
- pod health score,
- available unit backup or stock signals,
- treatment center capacity/load,
- days remaining,
- history of donor response speed.

Suggested thresholds:
- 70–100 = covered
- 40–69 = at risk
- 0–39 = critical

The purpose of this score is to tell whether the next transfusion is actually secure, not merely whether a request exists.

### 6. Covered path
If confidence stays high enough:
- Mark cycle as covered.
- Notify patient and caregiver using simple reassurance language.
- Confirm donor scheduling and center coordination.
- Keep the cycle in routine state until transfusion day.

### 7. At-risk path
If confidence drops below threshold but time still exists before due date:
- Upgrade cycle to at_risk.
- Trigger auto-repair engine.
- Show case in admin dashboard.
- Notify coordinator, but do not alarm patient with internal operational details.

### 8. Auto-repair engine
Auto-repair actions may include:
- Re-notify sleeping donors from the same pod.
- Expand outreach to remaining eligible pod donors.
- Suggest nearby partner pod support if available.
- Prompt admin to approve best routing channel.

This phase is meant to repair continuity before the situation becomes an emergency.

### 9. Emergency escalation
If repair fails or urgency becomes critical:
- Mark requirement as emergency.
- Push request to full eligible pod immediately.
- Notify city-level backup pools and emergency donor channels.
- Publish or route to public emergency board when needed, because Blood Warriors already exposes urgent emergency requests publicly.[cite:187][cite:191]
- Start real-time tracking until units are secured.

### 10. Transfusion day
On transfusion day, store:
- actual_donor_ids_used
- units_transfused
- pretransfusion_hb
- center_status
- outcome_status

Transfusions are generally tied to planned center visits and should be coordinated in advance where possible.[cite:204][cite:211]

### 11. Post-transfusion logging
After successful transfusion:
- Close requirement event.
- Mark cycle fulfilled.
- Notify caregiver that the cycle is complete.
- Send donor acknowledgement through donor-side flow.
- Automatically generate next cycle based on standard interval, unless clinician override exists.

### 12. Caregiver reassurance layer
Caregiver communication should use plain language such as:
- Your fighter is covered.
- Two donors confirmed.
- Next cycle is on [date].
- We are monitoring the pod.

This matters because psychosocial and caregiver burden in thalassemia is well documented, including anxiety and emotional load around chronic care.[cite:185]

### 13. Hb trend intelligence
Track pre-transfusion Hb values over time. Guidance for thalassemia management includes maintaining a transfusion plan with target hemoglobin logic and regular review.[cite:183][cite:210]

If the system detects repeated decline in pre-transfusion Hb across multiple cycles:
- flag coordinator,
- recommend review of schedule or clinical plan,
- do not expose raw clinical recommendations directly to caregiver without human review.

### 14. Pod health monitoring
Independently from each individual cycle, the system should check pod health monthly.

Pod health inputs:
- active donor count,
- sleeping donor count,
- cooldown count,
- repeated no-response patterns,
- emergency dependency frequency.

If pod health falls below minimum viable strength, trigger refill workflow.

### 15. Silent pod refill
If pod weakens:
- search new donors,
- screen and map them,
- update pod membership,
- do not surface anxiety-inducing internal pod weakness to patient unless needed.

### 16. Longitudinal patient record
Maintain a continuous care history for each patient:
- all cycles,
- all requirement events,
- all transfusion outcomes,
- all pre-transfusion Hb values,
- all emergency episodes,
- donor coverage history.

This should become a reusable continuity record for future coordination.

## Edge cases

### Patient or caregiver raises invalid request
Because Blood Warriors currently operates with human validation for request legitimacy, the system should support a validation status such as pending_verification before full donor blast if request source is manual.[cite:191]

### Pod has insufficient eligible donors
Escalate first to repair and then to emergency pools; do not assume every emergency donor becomes part of the long-term bridge.[cite:191]

### Center-side failure
If donor support exists but center stock or logistics fails, the requirement should still remain unresolved and visible in admin routing until complete.

## Recommended data objects

### Patient
```json
{
  "patient_id": "PT45",
  "display_name": "Ravi (masked)",
  "blood_group": "B+",
  "city": "Hyderabad",
  "center_id": "CTR09",
  "caregiver_contact": "+91...",
  "transfusion_frequency_days": 21,
  "expected_units_per_cycle": 2
}
```

### Cycle
```json
{
  "cycle_id": "CY88",
  "patient_id": "PT45",
  "due_date": "2026-06-22",
  "expected_units": 2,
  "status": "at_risk",
  "confidence_score": 62
}
```

### Requirement event
```json
{
  "requirement_id": "REQ12",
  "patient_id": "PT45",
  "cycle_id": "CY88",
  "trigger_type": "scheduled",
  "severity": "routine",
  "source": "system",
  "status": "matching"
}
```

## Build principles
- Hyderabad is the active city context.[cite:188][cite:187]
- Patients are recurring care entities, not isolated requests.[cite:204][cite:211]
- The requirement event is the core state machine.
- Confidence score is the main product differentiator.
- The system should reduce uncertainty before crisis, not merely react during crisis.
- Human validation should remain possible where request legitimacy is uncertain.[cite:191]
