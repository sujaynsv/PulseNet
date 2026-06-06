# Patient Management & Cycle Generation Flow

This document details the responsibilities and permissions boundaries between the Patient and the Admin roles specifically regarding the generation of Transfusion Cycles.

## 1. Core Principles

- **Patient is Read-Only for Schedules**: Patients should **not** have the ability to automatically self-schedule routine Transfusion Cycles or dynamically generate records in the database simply by visiting a page.
- **Admin is the Authority**: All routine Transfusion Cycles must be explicitly generated, vetted, and approved by the Blood Bank Coordinator (Admin).
- **Patient Profile Autonomy**: The Patient has the ability to update their basic contact information and report changes in their required medical frequency, which the Admin uses to generate schedules.

## 2. Patient Profile Workflow

1. **Accessing the Profile**: The Patient logs into their dashboard and accesses the `/patient/profile` route.
2. **Data Available for Editing**:
   - Full Name
   - Phone Number
   - Location
   - Blood Group
   - **Transfusion Frequency (Days)**
   - **Expected Next Transfusion Date**
3. **API Interaction**: 
   - Uses `GET /api/patient/me` to load data.
   - Uses `PATCH /api/patient/me` to save updates to the `users` table.

## 3. Admin Cycle Management Workflow

1. **Patient Directory**: The Admin visits `/admin/patients` to view a list of all registered patients, their blood groups, and their overall Bridge fill status.
2. **Selecting a Patient**: Clicking "Manage" routes the Admin to `/admin/patients/:id`.
3. **Reviewing the Patient**: The Admin reviews the patient's self-reported "Expected Next Transfusion Date" and "Frequency (Days)".
4. **Generating Cycles**:
   - If no cycles exist for the patient, the Admin clicks **"Generate Next 6 Cycles"**.
   - This fires `POST /api/admin/patients/{id}/generate-cycles`.
   - The backend reads the frequency and start date from the patient's profile and creates 6 `Cycle` rows in the PostgreSQL database with status `routine`.
5. **Visibility**: Immediately after the Admin generates these cycles, they become visible to the Patient on their `PatientHome` dashboard.

## 4. Edge Cases Handled

- **Empty State on Patient Dashboard**: If a patient registers but an Admin hasn't generated cycles yet, the Patient's Continuity Guarantee calendar safely shows an empty state: `"No upcoming cycles scheduled. Awaiting coordinator review."`
- **Duplicate Generation Prevention**: The Generate Cycles button on the Admin dashboard is disabled if the patient already has cycles scheduled to prevent duplication of records.
