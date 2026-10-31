#!/usr/bin/env bash
# One-time setup for deploying Plan B from source on a new Google Cloud project.
# Newer projects no longer give the default compute service account build permissions, so Cloud Build
# cannot read the uploaded source. This grants it exactly what a source deploy and the running app need.
set -euo pipefail

PROJECT=project-758e9575-b1d8-4d94-b28
NUMBER=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)")
SA="$NUMBER-compute@developer.gserviceaccount.com"

# Build from source: read the uploaded source, push the image, write build logs.
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/run.builder" --condition=None --quiet >/dev/null
# Run: call Gemini on Vertex AI.
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="roles/aiplatform.user" --condition=None --quiet >/dev/null

echo "Granted roles/run.builder and roles/aiplatform.user to $SA"
echo "Permissions can take a minute to apply. Then run: ./scripts/deploy.sh"
