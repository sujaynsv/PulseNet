# Blood Warriors Flow 3 — Admin / Org

## Purpose
This document captures the final Hyderabad-first admin and organizational command flow for Blood Warriors. It is intended for a coding agent and defines the operating system behind donor pods, patient continuity, emergency response, and city-level intervention.[cite:187][cite:188]

## Scope
- Active city: Hyderabad.[cite:188]
- Other cities may appear in UI as mock dropdown options for future scale, but all active logic should be Hyderabad-first.[cite:187]
- Admin users may include Blood Warriors coordinators, bridge managers, hospital-linked operators, and partner program managers.

## Product model
This is not a generic dashboard. It should function as a city-level orchestration layer where admins can:
- monitor patient pods,
- watch upcoming transfusion risk,
- intervene in emergency cases,
- route demand to the right support channels,
- monitor center stress,
- view partner capacity,
- and produce operational and impact reports.

Blood Warriors publicly operates across emergency requests, donor matching, awareness, and thalassemia support, which makes an orchestration model credible and aligned with their positioning.[cite:187][cite:189][cite:198]

## Flow overview
1. Admin logs into Hyderabad command center.
2. Dashboard shows current operational picture.
3. Admin inspects pod health.
4. Admin manages upcoming cycle readiness.
5. Smart routing is used for at-risk cycles.
6. Emergency board is monitored and resolved.
7. City intelligence surfaces center stress.
8. Partner network capacity informs intervention.
9. Prevention layer suggests campaigns.
10. Reports summarize execution and impact.

## Detailed flow

### 1. Admin entry
On login, default city should be Hyderabad because Blood Warriors is headquartered there and publicly active there.[cite:188][cite:187]

Top-level UI elements:
- city selector: Hyderabad active; other cities shown as coming soon,
- notification badge,
- summary tiles,
- emergency count,
- at-risk cycle count.

### 2. Live dashboard
The first screen should present the current city health state, not a blank workspace.

Core dashboard cards:
- active patient pods,
- upcoming cycles in next 7 days,
- at-risk cycles,
- open emergency requests,
- donor availability summary,
- center stress alerts.

Blood Warriors already publicly displays emergency requests and support pathways, which supports a dashboard driven by live requests and coordination needs.[cite:187][cite:191]

### 3. Pod command center
Admin needs a dedicated pod management view.

Each pod row should show:
- patient_id or masked name,
- blood group,
- center,
- next cycle date,
- confidence score,
- pod health score,
- donor breakdown: active / sleeping / cooldown,
- current status: healthy / at risk / critical.

Sorting should prioritize weakest pods first.

### 4. Pod intervention
If pod health is low, admin actions may include:
- trigger AI refill,
- manually add a screened donor,
- temporarily pull from partner pod logic,
- escalate cycle toward emergency support,
- assign follow-up task to coordinator.

This is where the system turns operational visibility into intervention.

### 5. 7-day cycle readiness
Provide a view of all Hyderabad cycles due in the next 7 days.

Each cycle card should show:
- due date,
- patient,
- units expected,
- confirmed donors,
- confidence score,
- state: covered / at risk / critical.

This gives admin a time-based action queue rather than only a static patient list.

### 6. Smart routing engine
When a cycle is at risk, the system should recommend the best resolution path.

Possible routes:
- reactivate same-pod donors,
- expand within remaining eligible pod donors,
- use partner pool,
- use corporate or Rotary donor channels,
- contact center-linked blood source,
- escalate to emergency board.

The Blood Warriors ecosystem includes partner and campaign layers, which makes this routing model aligned with their real-world operating context.[cite:189][cite:195]

Admin should review and approve the recommended path, after which the system triggers outreach and tracking.

### 7. Emergency command view
A dedicated emergency board should exist inside admin mode.

Each emergency request should show:
- blood group,
- patient or masked identifier,
- center,
- units needed,
- time remaining,
- current outreach status,
- assigned donors if any.

Blood Warriors already has a public emergency request board, so the admin layer should extend that with assignment and resolution controls.[cite:187][cite:191]

### 8. Emergency resolution workflow
For every emergency case, track:
- donor assigned,
- donor confirmed,
- center informed,
- units arranged,
- case closed.

If any checkpoint fails, the case should remain active and visible until resolved.

### 9. Center stress heatmap
Admin should have a Hyderabad center stress view.

Per center, track:
- number of upcoming cycles,
- donor depth in nearby catchment,
- open emergency dependency,
- stock-risk proxy or center readiness signal,
- predicted stress level over next 7 to 14 days.

This allows preventive action before failures become public emergencies.

### 10. Pre-emptive action for stressed centers
If a center is forecast to be stressed:
- direct donor recruitment toward that zone,
- trigger targeted outreach,
- schedule a blood drive,
- inform partner network,
- re-route cases where possible.

### 11. Partner network view
Admin should be able to see support channels beyond core pods.

Suggested partner categories:
- Rotary chapters,
- corporate donor pools,
- hospitals,
- blood banks,
- allied NGOs.

Blood Warriors publicly emphasizes multi-stakeholder work and partner support, which supports a network-capacity view.[cite:189][cite:195]

### 12. Prevention intelligence layer
This layer is strategic rather than immediate-response focused.

Use zone-level data to highlight:
- low screening awareness,
- repeated patient concentration,
- under-served neighborhoods,
- where awareness or premarital screening drives may be valuable.

Blood Warriors explicitly positions itself not only as a transfusion-support organization but also as part of a thalassemia-free mission, which supports this prevention layer.[cite:189]

### 13. Reporting and export
Admin should be able to export:
- donor reliability metrics,
- pod performance metrics,
- emergency resolution metrics,
- cycle coverage rate,
- center-level support strength,
- city-level impact numbers.

Blood Warriors publishes formal organizational documentation and partner-facing material, which supports the need for reportable operational outputs.[cite:194][cite:195]

## Edge cases

### Emergency covered by one-time donor
Do not automatically merge that donor into a patient pod. Keep them tagged separately unless explicitly converted after screening and consent.[cite:191]

### Pod appears healthy but center fails
The case should still surface as unresolved because patient continuity depends on both donor readiness and center execution.

### Multiple at-risk cycles compete for the same donor pool
Use donor eligibility and route prioritization rather than naive parallel assignment.

## Recommended data objects

### Admin dashboard summary
```json
{
  "city": "Hyderabad",
  "active_pods": 126,
  "cycles_next_7_days": 38,
  "at_risk_cycles": 7,
  "open_emergencies": 4,
  "stressed_centers": 2
}
```

### Pod health row
```json
{
  "patient_pod_id": "POD12",
  "patient_id": "PT45",
  "blood_group": "B+",
  "center_id": "CTR09",
  "next_cycle_date": "2026-06-22",
  "confidence_score": 62,
  "pod_health_score": 54,
  "active_donors": 4,
  "sleeping_donors": 2,
  "cooldown_donors": 3,
  "status": "at_risk"
}
```

### Emergency case
```json
{
  "requirement_id": "REQ12",
  "severity": "emergency",
  "blood_group": "B+",
  "center_id": "CTR09",
  "units_needed": 2,
  "time_remaining_hours": 9,
  "assigned_donor_ids": ["D123"],
  "status": "partially_covered"
}
```

## Build principles
- Hyderabad-first implementation, scale-ready UI.[cite:188][cite:187]
- Admin should manage a network, not isolated cases.
- Risk surfaces before crisis when possible.
- Smart routing should reduce manual decision load.
- Public emergency board is an escalation layer, not the only system of work.[cite:187][cite:191]
- Prevention intelligence should coexist with operational coordination because that matches Blood Warriors’ broader mission.[cite:189]
