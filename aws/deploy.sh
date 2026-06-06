#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PulseNet — AWS Deployment Script
# Usage: ./aws/deploy.sh [dev|staging|prod]
# Prerequisites: aws CLI, docker, git
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

ENV=${1:-dev}
AWS_REGION=${AWS_REGION:-us-east-1}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_BASE="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
GIT_SHA=$(git rev-parse --short HEAD)

BACKEND_IMAGE="${ECR_BASE}/pulsenet-backend:${GIT_SHA}"
FRONTEND_IMAGE="${ECR_BASE}/pulsenet-frontend:${GIT_SHA}"

echo "🚀 Deploying PulseNet [${ENV}] — commit ${GIT_SHA}"
echo "   AWS Account: ${AWS_ACCOUNT_ID} | Region: ${AWS_REGION}"

# ── Step 1: Login to ECR ─────────────────────────────────────────────────────
echo ""
echo "🔐 Logging in to ECR…"
aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "${ECR_BASE}"

# ── Step 2: Build + push backend ─────────────────────────────────────────────
echo ""
echo "🏗️  Building backend image…"
docker build -t "$BACKEND_IMAGE" ./backend
docker push "$BACKEND_IMAGE"
echo "   ✅ Backend pushed: $BACKEND_IMAGE"

# ── Step 3: Build + push frontend ────────────────────────────────────────────
echo ""
echo "🏗️  Building frontend image…"
docker build \
  --build-arg VITE_API_URL="https://$(aws apprunner list-services \
    --query "ServiceSummaryList[?ServiceName=='pulsenet-backend'].ServiceUrl" \
    --output text 2>/dev/null || echo 'localhost:8000')" \
  -t "$FRONTEND_IMAGE" ./frontend
docker push "$FRONTEND_IMAGE"
echo "   ✅ Frontend pushed: $FRONTEND_IMAGE"

# ── Step 4: Deploy CloudFormation stack ──────────────────────────────────────
echo ""
echo "☁️  Deploying CloudFormation (SAM)…"

# Retrieve DATABASE_URL and SECRET_KEY from AWS Secrets Manager (preferred)
# Fallback: read from local .env (not recommended for production)
DB_URL=${DATABASE_URL:-$(aws secretsmanager get-secret-value \
  --secret-id pulsenet/database_url --query SecretString --output text 2>/dev/null || echo '')}
SECRET=${SECRET_KEY:-$(aws secretsmanager get-secret-value \
  --secret-id pulsenet/secret_key --query SecretString --output text 2>/dev/null || echo 'change_me')}

sam deploy \
  --template-file aws/template.yaml \
  --stack-name "pulsenet-${ENV}" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --region "$AWS_REGION" \
  --parameter-overrides \
    Environment="${ENV}" \
    DatabaseUrl="${DB_URL}" \
    SecretKey="${SECRET}" \
    BackendImageUri="${BACKEND_IMAGE}" \
    FrontendImageUri="${FRONTEND_IMAGE}" \
  --no-fail-on-empty-changeset

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📡 Endpoints:"
aws cloudformation describe-stacks \
  --stack-name "pulsenet-${ENV}" \
  --query "Stacks[0].Outputs[?OutputKey=='BackendURL' || OutputKey=='FrontendURL'].[OutputKey,OutputValue]" \
  --output table
