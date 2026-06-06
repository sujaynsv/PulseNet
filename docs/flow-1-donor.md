# Blood Warriors Flow 1 — Donor

## Purpose
This document captures the final donor-side product flow for a Hyderabad-first Blood Warriors system. It is written for implementation by a coding agent and reflects the Blood Bridge model where a patient is supported by a mapped pod of donors rather than random public matching.[cite:187][cite:215]

## Scope
- City context: Hyderabad first.[cite:188][cite:187]
- Donor flow begins after donor discovery and registration.
- Donor may come from blood camps, portal signup, direct outreach, or targeted lead generation; Blood Warriors publicly supports donor registration and Blood Bridge preference on its donor form.[cite:217]
- Donor is mapped to a specific patient pod, usually around 8–10 donors per patient, which aligns with Blood Warriors’ Blood Bridge positioning.[cite:215][cite:198]

## Product model
The system should treat donors as part of a recurring support network for thalassemia patients rather than one-time responders. Blood Warriors publicly positions Blood Bridge as connecting patients with committed donors, and thalassemia transfusion care is generally planned at regular intervals, often every 3–4 weeks for many patients on transfusion-dependent schedules.[cite:215][cite:183][cite:211]

## Flow overview
1. Donor discovers Blood Warriors.
2. Donor registers.
3. Donor profile is created and screened.
4. Donor is matched to a patient pod.
5. Donor receives pod onboarding.
6. Upcoming transfusion requirement activates donor outreach.
7. Donor confirms or declines.
8. If confirmed, donation is scheduled.
9. If declined or unresponsive, next eligible donor is contacted.
10. After donation, donor receives acknowledgement and enters cooldown.
11. Donor re-enters eligibility after cooldown and stays part of the bridge.

## Detailed flow

### 1. Donor discovery
Possible acquisition channels:
- Blood camps and corporate blood drives.
- Blood bank referrals.
- Website donor registration.
- Blood Bridge-specific interest through the portal.
- Lead generation from social media campaigns.

The public Blood Warriors website provides donor registration and explicitly includes a Blood Bridge preference, which supports this acquisition logic.[cite:217]

### 2. Donor registration
The donor should be able to register through one of:
- Web form.
- WhatsApp/chatbot-assisted flow.
- QR flow tied to offline events.

Required fields:
- Name.
- Age.
- Gender.
- Blood group.
- City and locality.
- Preferred donation center or travel radius.
- Preferred contact channel: WhatsApp, SMS, phone.
- General availability: weekdays, weekends, mornings, afternoons.
- Willingness to join Blood Bridge.

### 3. Donor screening and profile creation
After registration, create a donor profile with:
- donor_id
- blood_group
- city
- location_coordinates or locality
- contact_preferences
- availability_windows
- status: lead / screened / eligible / ineligible / active / cooldown
- bridge_preference: yes/no
- reliability_score
- last_donation_date
- next_eligible_date

Blood Warriors currently validates and screens donors before mapping, and real-world donor eligibility is medically screened by professionals before donation and again after collection.[cite:217][cite:221]

### 4. Patient pod matching
Once the donor is screened and eligible, match the donor to a patient pod.

Matching logic should consider:
- Exact blood group compatibility for the specific patient.[cite:187]
- Hyderabad location proximity to treatment center.[cite:188]
- Availability alignment with the patient’s expected transfusion cycles.
- Existing pod strength and vacancy.
- Donor reliability score.

The default pod model is around 8–10 donors per patient, but this may be lower for difficult blood groups or higher for patients requiring heavier transfusion coverage.[cite:215]

### 5. Pod onboarding
Once matched, donor receives a pod onboarding message.

Recommended message content:
- Acknowledge they are now supporting a specific thalassemia patient through Blood Bridge.
- Show anonymized patient context: age range, city, treatment center area, recurring need.
- Explain that transfusions are recurring and usually scheduled in advance.[cite:204][cite:211]
- Explain that only eligible donors are alerted each cycle.
- Explain that this is a long-term support role, not a one-time emergency-only role.

### 6. Requirement activation
The donor side is activated when a patient requirement event is created.

Requirement events should come from:
- Scheduled cycle trigger: the patient’s fixed calendar activates the upcoming cycle.[cite:204][cite:213]
- Validated request trigger: patient or caregiver raises a request through portal/chatbot and it is confirmed by Blood Warriors’ process.[cite:191][cite:187]
- Emergency escalation: if the patient pod cannot cover the need in time.[cite:187][cite:191]

For a routine cycle, the system should first contact only eligible donors within that patient’s bridge.

### 7. Smart outreach
For each active requirement event, outreach should be sent only to eligible donors in that pod.

Outreach rules:
- Exclude donors still on cooldown.
- Exclude donors marked unavailable, sick, traveling, or otherwise temporarily inactive.
- Rank donors by reliability and response speed.
- Send batched or sequenced requests depending on urgency.
- Routine cycles may use staged outreach; emergency cycles may blast all eligible pod donors immediately.

Suggested payload:
- patient_pod_id
- requirement_id
- blood_group
- center_name
- required_units
- date_needed
- response_actions: confirm / unavailable / call me

### 8. Donor confirmation logic
When donor responds:
- If donor confirms and slots are still open, mark as selected.
- If enough donors have already confirmed, mark later confirmations as standby or not required.
- If donor declines, mark unavailable for that requirement.
- If donor does not respond within a set time window, mark no_response and continue to next eligible donors.

Blood Warriors’ current operational logic is effectively first-come-first-serve once enough donor confirmations are obtained for the required units, and excess confirmations are not used for additional collection.[cite:187]

### 9. Scheduling
When enough donors confirm:
- Book donation slots.
- Notify the confirmed donors only.
- Inform coordinator and center.
- Lock requirement coverage status as covered or partially covered depending on units.

Each donor typically contributes one unit, so unit planning should be tied to confirmed donor count.[cite:221]

### 10. Donation completion
After donation is completed and confirmed by the blood bank or coordinator:
- Update donor record with last_donation_date.
- Compute next_eligible_date.
- Move donor status to cooldown.
- Increase reliability score if donor showed up after confirming.
- Store linked requirement_id and patient_pod_id.

### 11. Cooldown and re-entry
Whole blood donors should not be treated as immediately reusable. Typical donation interval guidance in India is at least 3 months for males and 4 months for females, and the system should track next eligibility accordingly.[cite:218][cite:221]

Only donors whose next_eligible_date has passed should be included in future pod outreach. This means that each cycle is sent only to the currently eligible subset of the bridge.

### 12. Acknowledgement and retention
After successful donation:
- Send acknowledgement via chatbot/WhatsApp.
- Optionally issue a donor certificate, matching Blood Warriors’ current closure loop behavior.[cite:187]
- Update donor-facing impact metrics such as cycles supported and patients helped.

## Edge cases

### If not enough eligible pod donors exist
Flow should be:
1. Exhaust eligible pod donors.
2. If still uncovered, escalate to emergency or one-time donor pool.
3. Do not permanently add one-time emergency donors into the bridge by default.

This matches the operational distinction between bridge donors and emergency or one-time donors.[cite:187][cite:191]

### If patient requires higher-than-normal unit volume
Do not ask one donor for more than a standard donation unit. Instead, increase donor coverage and/or larger bridge size for that patient over time.[cite:221]

### If donor repeatedly ignores requests
Lower reliability score and deprioritize in ranking, but do not remove automatically until admin review.

## Recommended data objects

### Donor
```json
{
  "donor_id": "D123",
  "name": "...",
  "blood_group": "B+",
  "city": "Hyderabad",
  "locality": "Kukatpally",
  "status": "active",
  "reliability_score": 0.82,
  "last_donation_date": "2026-05-01",
  "next_eligible_date": "2026-08-01",
  "contact_preference": "whatsapp",
  "bridge_preference": true
}
```

### Requirement event
```json
{
  "requirement_id": "R456",
  "patient_pod_id": "POD12",
  "trigger_type": "scheduled",
  "severity": "routine",
  "blood_group": "B+",
  "units_needed": 2,
  "center_id": "CTR09",
  "due_date": "2026-06-22",
  "status": "matching"
}
```

### Pod assignment
```json
{
  "patient_pod_id": "POD12",
  "patient_id": "PT45",
  "city": "Hyderabad",
  "required_blood_group": "B+",
  "donor_ids": ["D123", "D124", "D125"],
  "health_score": 74
}
```

## Build principles
- Hyderabad is the active city and should be the default city context because Blood Warriors is based there and publicly operates there.[cite:188][cite:187]
- Treat Blood Bridge as a recurring pod model, not a one-time matching marketplace.[cite:215][cite:198]
- Separate bridge donors from emergency one-time donors.[cite:191]
- Track eligibility and cooldown rigorously.[cite:218][cite:221]
- Build for human-in-the-loop validation where needed, with room for later automation.[cite:191]
