Here’s a detailed spec you can treat as `docs/ui/donor_dashboard.md` for your dev agents.

***

# Donor Dashboard (PulseNet – Donor Flow)

## Purpose

The Donor Dashboard is the **main home screen** for a donor after onboarding.  
Instead of a static profile page, it shows:

- Their key info (in a compact header)
- Their current Blood Bridge pod and patient context
- Upcoming donation opportunities
- Impact and history
- Settings they care about (availability, notification prefs, languages)

The goal is: **“I know who I’m helping, when I’m needed next, how I’m doing, and I can control how and when you contact me.”**

***

## Page Structure (High-Level)

1. **Top bar / app bar**
2. **Donor Summary Header** (readable snapshot)
3. **Upcoming Donation Panel**
4. **Blood Bridge Pod Panel**
5. **Impact & History Panel**
6. **Preferences & Settings**
7. **Footer / Help & Support**

***

## 1. Top Bar / App Bar

**Elements**

- App name: `PulseNet | Blood Warriors`
- City indicator: `Hyderabad`
- Icon/button: `Help` (opens help / WhatsApp support link)
- Optional: Sign out icon

No heavy logic here; just consistent branding + quick access to support.

***

## 2. Donor Summary Header

**Goal**: Show the donor their identity and status in one glance.

### Fields Displayed

- Donor name: `Ravi Kumar`
- Donor ID: `DW-12345`
- Blood group badge: `B+`
- City: `Hyderabad`
- Status chip:
  - `ACTIVE`
  - `ON COOLDOWN` (with “eligible from [date]”)
  - `INACTIVE` (if they paused participation)
- Last donation:
  - `Last donation: 12 May 2026 at [Center Name]`
- Next eligibility:
  - `Eligible from: 11 July 2026`

### Actions

- **Edit Info** (button)
  - Opens side panel or modal:
    - Editable:
      - Name
      - Area/pincode
      - Travel radius
      - Languages
    - Non-editable by default:
      - Blood group (change requires admin)
- **Pause participation** (toggle)
  - `I need a break` → sets status to `INACTIVE`, reduces outreach
  - Reason dropdown: `Health`, `Travel`, `Busy`, `Other`

**Backend Dependencies**

- `GET /donor/{id}`
- `PATCH /donor/{id}` for updates
- `PATCH /donor/{id}/status` to pause/activate

***

## 3. Upcoming Donation Panel

**Title**: `Your Next Opportunity`

### Display Logic

- If donor is **eligible** and assigned to a pod with an upcoming cycle:
  - Show:
    - `Next cycle: 14 June 2026`
    - `Patient location: [Center Name, Hyderabad]`
    - `Time window: 9:00–12:00`
    - Status chip:
      - `REQUESTED` (system has invited donor)
      - `CONFIRMED` (donor has accepted)
      - `DECLINED` (they declined)
- If donor is **on cooldown**:
  - Show:
    - `You’re on a short break until [eligible_from_date].`
    - `We’ll reach out after this date.`
- If donor has no assigned pod:
  - Show:
    - `We’re matching you to a fighter in Hyderabad.`
    - `You’ll be notified as soon as your Blood Bridge pod is ready.`

### Actions

- **Confirm participation** (`I can donate this cycle`)
  - Confirms for the next upcoming cycle.
  - Backend: `POST /donor/{id}/confirm-cycle` with `cycle_id`.
- **Can’t come this time** (`I can’t make it`)
  - Declines, triggers auto-escalation to next donor in pod.
  - Prompt for reason (optional): `Health`, `Travel`, `Work`, `Other`.
  - Backend: `POST /donor/{id}/decline-cycle`.
- **Request another time** (`Suggest another day/time`)
  - Opens small form:
    - Alternative day/time within allowed window.
  - Backend: `POST /donor/{id}/reschedule-suggestion`.

***

## 4. Blood Bridge Pod Panel

**Title**: `Your Blood Bridge Pod`

### Display Elements

- Patient context (anonymized):
  - `You are part of a support circle for a fighter at [Center Name], Hyderabad.`
  - `Cycles: about every [X] weeks.`
- Pod members summary (no full names; privacy-safe):
  - `You + 7 other donors`
  - Small chips: `Donor A`, `Donor B`, `Donor C`, etc. with `Active`/`Sleeping` icons.
- Pod health indicator:
  - Simple label: `Pod Status: Strong / Stable / Needs You`
  - Derived from pod health score, but simplified.

### Actions

- **View details (optional)**:
  - Expanded view shows:
    - Approximate cycle pattern (e.g., “Every 3rd Tuesday”)
    - How many donors are currently active vs sleeping
- No ability to see exact other donors’ personal data — only status and count.

**Backend**

- `GET /donor/{id}/pod`
  - returns:
    - `pod_id`
    - `center`
    - `cycle_pattern`
    - `pod_size`
    - `active_donor_count`
    - `pod_status_label`

***

## 5. Impact & History Panel

**Title**: `Your Impact`

### Info to Show

- Counters:
  - `Total donations: 7`
  - `Total cycles supported: 5`
  - `Emergencies responded: 2`
- Recent history timeline:
  - Entries like:
    - `12 May 2026 – Donated at [Center Name] – Supported Cycle 3`
    - `20 March 2026 – Emergency donation – Hyderabad`
- Optional: simple badge/rank
  - `Status: Blood Warrior (Level 2)`

### Actions

- **Download acknowledgement** (if Blood Warriors issues certificates)
  - `Download certificate for last donation` → PDF.

**Backend**

- `GET /donor/{id}/impact`
  - `total_donations`
  - `cycles_supported`
  - `emergencies`
  - `history[]` with `date`, `center`, `type`.

***

## 6. Preferences & Settings

**Title**: `Your Preferences`

### Sections

1. **Contact Preferences**
   - Checkboxes/toggles:
     - `WhatsApp` (default on)
     - `SMS`
     - `Phone call`
     - `Email` (if available)
   - Backend: `PATCH /donor/{id}/preferences/contact`.

2. **Availability Settings**
   - Day chips:
     - `Mon … Sun`
   - Time slots:
     - `Morning (6–12)`, `Afternoon (12–5)`, `Evening (5–9)`
   - Travel radius slider:
     - `0–5 km`, `5–10 km`, `10–20 km`, `City-wide`
   - Backend: `PATCH /donor/{id}/preferences/availability`.

3. **Language & UI**
   - `Preferred language`: `English`, `Telugu`, `Hindi` (multi-select possible).
   - This informs WhatsApp bot / SMS language.
   - Backend: `PATCH /donor/{id}/preferences/language`.

4. **Health / Medical Notes (optional)**
   - Safe text input where donor can add:
     - `Doctor advised max X donations per year`, etc.
   - Flag: `requires_admin_review` if changed.
   - Backend: `PATCH /donor/{id}/notes`.

***

## 7. Footer / Help & Support

- **FAQ link**: “What if I can’t donate one cycle?” → static page or modal.
- **Urgent contact**: Button/link to Blood Warriors support number / WhatsApp.
- Legal/consent links: `Privacy`, `Terms`.

***

## UX Rules & Edge Cases

1. **Cooldown state**
   - If donor is on cooldown:
     - Disable `Confirm` buttons.
     - Show: `You’re temporarily on hold until [date] for your safety.`
   - Backend ensures no cycle confirmation is accepted during this window.

2. **Inactive state**
   - If status = `INACTIVE`:
     - Show banner: `You are currently paused.`
     - Only actions:
       - `Resume participation`
       - Edit profile
   - No cycle invites are shown.

3. **Unassigned donor**
   - If donor not yet in a pod:
     - Hide pod panel; show “We’re matching you” message.
     - Impact panel still shows previous donations if any.

4. **Multiple pods (rare)**
   - If donor is primary in one pod and backup in another:
     - Upcoming section shows the **primary pod’s next cycle** first.
     - Secondary commitments can appear in “Other opportunities”.

***

## API Summary (for devs)

- `GET /donor/{id}` → summary header
- `PATCH /donor/{id}` → update basic info
- `PATCH /donor/{id}/status` → active/inactive/cooldown
- `GET /donor/{id}/next-cycle` → upcoming donation info
- `POST /donor/{id}/confirm-cycle` → confirm
- `POST /donor/{id}/decline-cycle` → decline
- `POST /donor/{id}/reschedule-suggestion` → suggest alt time
- `GET /donor/{id}/pod` → pod info
- `GET /donor/{id}/impact` → impact stats & history
- `PATCH /donor/{id}/preferences/contact`
- `PATCH /donor/{id}/preferences/availability`
- `PATCH /donor/{id}/preferences/language`
- `PATCH /donor/{id}/notes`

***

If you want, I can also turn this into a quick **wireframe sketch description** (section-wise layout) or a JSON UI schema that your React agent can consume directly.