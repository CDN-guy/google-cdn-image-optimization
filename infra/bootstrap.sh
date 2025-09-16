#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID="" # gcp project id
PROJECT_NUM="" # gcp project number
LOCATION="" # e.g. us-central1
REPO_NAME="" # e.g. img-opt

# Enable services
printf "=========================================\n"
printf "Enabling services on project...\n" 
printf "=========================================\n"
gcloud services enable artifactregistry.googleapis.com cloudapis.googleapis.com cloudbuild.googleapis.com compute.googleapis.com run.googleapis.com storage-api.googleapis.com storage-component.googleapis.com storage.googleapis.com --project "${PROJECT_ID}"

#Create Artifact Registry docker repo
printf "=========================================\n"
printf "Creating Artifact Registry docker repo...\n" 
printf "=========================================\n"
gcloud artifacts repositories create "${REPO_NAME}-${PROJECT_NUM}" --location "${LOCATION}" --repository-format=docker --project "${PROJECT_ID}" || 

# Run Cloud Build for backend with name of repo to build and push proxy images and imaginary image
printf "=========================================\n"
printf "Building images...\n" 
printf "=========================================\n"
cd ../src || exit
gcloud builds submit --tag "${LOCATION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}-${PROJECT_NUM}/image-optimizer:latest" 
cd ../infra || exit

printf "=========================================\n"
printf "[Success]Image URL:\n" 
printf "${LOCATION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}-${PROJECT_NUM}/image-optimizer:latest\n"
printf "=========================================\n"
