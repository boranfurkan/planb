#!/usr/bin/env bash
# Deploys Plan B to Cloud Run (London) with a public URL, billed to the trial project.
# Vertex AI is reached with the Cloud Run service account; the TfL key is read from .env.local and never printed.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=project-758e9575-b1d8-4d94-b28
TFL=$(grep -E "^TFL_APP_KEY=" .env.local | cut -d= -f2-)

gcloud run deploy planb \
  --source . \
  --region europe-west2 \
  --project "$PROJECT" \
  --allow-unauthenticated \
  --quiet \
  --memory 1Gi --cpu 1 --timeout 300 \
  --min-instances 1 --max-instances 1 --concurrency 40 \
  --set-env-vars "GOOGLE_GENAI_USE_ENTERPRISE=true,GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=global,PLANB_MODEL=gemini-3.8-flash,TFL_APP_KEY=$TFL" \
  2>&1 | grep -v "TFL_APP_KEY"
