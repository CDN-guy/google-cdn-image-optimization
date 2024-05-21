#!/usr/bin/env bash

set -euo pipefail

PROJECT_ID=""
PROJECT_NUM=""
LOCATION=""
REPO_NAME=""

# Enable services
printf "=========================================\n"
printf "Enabling services on project...\n" 
printf "=========================================\n"
gcloud services enable artifactregistry.googleapis.com cloudapis.googleapis.com cloudbuild.googleapis.com compute.googleapis.com run.googleapis.com storage-api.googleapis.com storage-component.googleapis.com storage.googleapis.com --project "${PROJECT_ID}"

#Create Artifact Registry docker repo
printf "=========================================\n"
printf "Creating Artifact Registry docker repo...\n" 
printf "=========================================\n"
gcloud artifacts repositories create "${REPO_NAME}-${PROJECT_NUM}" --location "${LOCATION}" --repository-format=docker --project "${PROJECT_ID}"

# Run Cloud Build for backend with name of repo to build and push proxy images and imaginary image
printf "=========================================\n"
printf "Building images...\n" 
printf "=========================================\n"
cd ../src || exit
gcloud builds submit --tag "${LOCATION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}-${PROJECT_NUM}/image-optimizer:latest" 
cd ../infra || exit

printf "=========================================\n"
printf "Custom Image built sucessfully\n" 
printf "=========================================\n"

# printf "=========================================\n"
# printf "Initializing terraform...\n" 
# printf "=========================================\n"
# terraform init

# printf "=========================================\n"
# printf "Applying terraform...\n" 
# printf "=========================================\n"
# terraform apply -auto-approve
