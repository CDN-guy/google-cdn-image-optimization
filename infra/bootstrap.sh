#!/usr/bin/env bash

set -euo pipefail

# Configuration parameters
PROJECT_ID="" # e.g. "my-gcp-project"
PROJECT_NUM="" # e.g. "123456789012"
LOCATION="us-central1" # e.g. "us-central1"
REPO_NAME="img-opt" # e.g. "img-opt"

# Validate required variables
if [ -z "${PROJECT_ID}" ] || [ -z "${PROJECT_NUM}" ]; then
  printf "\n[Error] Please configure PROJECT_ID and PROJECT_NUM at the top of this script before running.\n\n" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Enable GCP Services
printf "=========================================\n"
printf "Enabling services on project: %s...\n" "${PROJECT_ID}"
printf "=========================================\n"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudapis.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  run.googleapis.com \
  storage-api.googleapis.com \
  storage-component.googleapis.com \
  storage.googleapis.com \
  --project "${PROJECT_ID}"

# Create Artifact Registry docker repository if not exists
printf "=========================================\n"
printf "Creating Artifact Registry docker repo...\n"
printf "=========================================\n"
gcloud artifacts repositories create "${REPO_NAME}-${PROJECT_NUM}" \
  --location "${LOCATION}" \
  --repository-format=docker \
  --project "${PROJECT_ID}" || true

# Run Cloud Build to build and push container image
printf "=========================================\n"
printf "Building and pushing container image...\n"
printf "=========================================\n"
IMAGE_TAG="${LOCATION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}-${PROJECT_NUM}/image-optimizer:v1.0.7"

cd "${REPO_ROOT}/src"
gcloud builds submit --tag "${IMAGE_TAG}"
cd "${SCRIPT_DIR}"

printf "=========================================\n"
printf "[Success] Container Image URL:\n"
printf "%s\n" "${IMAGE_TAG}"
printf "=========================================\n"
