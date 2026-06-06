# PulseNet 🩸

> **AI FOR GOOD 2.0 Hackathon** — Blood Warriors Foundation  
> AI-Enabled Care Coordination & Access for Thalassemia Patients

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    AWS Cloud                        │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐   │
│  │  App Runner  │    │  App Runner              │   │
│  │  (Frontend)  │───▶│  (FastAPI Backend)       │   │
│  │  React+Vite  │    │  Port 8000               │   │
│  └──────────────┘    └────────────┬─────────────┘   │
│                                   │                  │
│  ┌────────────┐  ┌─────────────┐  │  ┌───────────┐  │
│  │ SageMaker  │  │  AWS RDS    │◀─┘  │  Bedrock  │  │
│  │ XGBoost    │  │ PostgreSQL  │     │  Claude   │  │
│  │  Endpoint  │  └─────────────┘     │  Haiku    │  │
│  └────────────┘                      └───────────┘  │
│                                                     │
│  ┌────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   Cognito  │  │  SNS / SES  │  │  CloudWatch │  │
│  │    Auth    │  │  Notifs     │  │   Logging   │  │
│  └────────────┘  └─────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Team Branch Strategy

| Branch | Owner | Focus |
|--------|-------|-------|
| `main` | All | Baseline walking skeleton (this) |
| `feature/donor-flow` | Teammate 1 | Donor profile management, webhooks, re-engagement |
| `feature/patient-flow` | Teammate 2 | Patient intake, transfusion calendar, Bridge mapping |
| `feature/admin-ai` | Teammate 3 | Coordinator dashboard, XGBoost model integration, Bedrock AI |

---

## Quick Start (Local)

### Prerequisites
- Docker Desktop
- Node.js 20+
- Python 3.11+
- AWS CLI (configured with hackathon credentials)

### 1. Set up environment
```bash
cd pulsenet
cp .env.example .env
# Edit .env — add your AWS RDS DATABASE_URL from the hackathon portal
```

### 2. Run with Docker Compose
```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| API Docs | http://localhost:8000/api/docs |

### 3. Or run services individually

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev     # → http://localhost:5173
```

---

## API Endpoints

### Health
```
GET /api/health           → { status: "ok", service: "pulsenet-backend" }
```

### Donor
```
GET  /api/donor/                    → List eligible donors
GET  /api/donor/{id}                → Get donor profile
PUT  /api/donor/{id}                → Update profile
POST /api/donor/webhook/availability → Availability confirmation webhook
```

### Patient
```
POST /api/patient/register          → Register new patient
GET  /api/patient/{id}              → Get profile
POST /api/patient/{id}/transfusion  → Log completed transfusion
GET  /api/patient/{id}/schedule     → Upcoming transfusion dates
```

### Admin / AI
```
GET /api/admin/stats                → Dashboard statistics
GET /api/admin/bridge/mock          → 🤖 ML-ranked donor list (E2E demo)
GET /api/admin/bridges              → All active bridges
GET /api/admin/donors/inactive      → Re-engagement targets
```

---

## AWS Deployment

```bash
# Make deploy script executable
chmod +x aws/deploy.sh

# Deploy to development
./aws/deploy.sh dev

# Deploy to production
./aws/deploy.sh production
```

### Plugging in the XGBoost Model
1. Train your model and export it: `joblib.dump(model, 'xgboost_model.pkl')`
2. Drop `xgboost_model.pkl` into `backend/services/`
3. The `rank_donors()` function auto-detects and uses it — no code changes needed
4. For SageMaker endpoint, update `SAGEMAKER_ENDPOINT_NAME` in `.env`

### Plugging in Amazon Bedrock
Add to `backend/services/bedrock.py` using the pattern:
```python
import boto3
bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
response = bedrock.invoke_model(modelId='anthropic.claude-3-haiku-20240307-v1:0', ...)
```

---

## Dataset → Schema Mapping

| Dataset Column | DB Column | Model |
|----------------|-----------|-------|
| `user_id` | `external_id` | User |
| `blood_group` | `blood_group` | User |
| `eligibility_status` | `eligibility_status` | User |
| `calls_to_donations_ratio` | `calls_to_donations_ratio` | User |
| `expected_next_transfusion_date` | `expected_next_transfusion_date` | Bridge |
| `bridge_id` | `external_bridge_id` | Bridge |
| `donated_earlier` | `donated_earlier` | BridgeMember |
| `user_donation_active_status` | `user_donation_active_status` | User |
| `inactive_trigger_comment` | `inactive_trigger_comment` | User |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI + Python 3.11 (async) |
| ORM | SQLAlchemy 2.0 (async) + Pydantic v2 |
| Database | AWS RDS (PostgreSQL 15) |
| ML | XGBoost + SageMaker |
| AI | Amazon Bedrock (Claude Haiku) |
| Auth | AWS Cognito |
| Notifications | AWS SNS + SES |
| Deploy | AWS App Runner + ECR |
| Monitoring | AWS CloudWatch |
| Container | Docker + Nginx |
