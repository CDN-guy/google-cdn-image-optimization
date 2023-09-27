variable "project_id" {
  type        = string
  default = "img-optimization"
  description = "GCP Project ID"
}

variable "project_number" {
  type        = string
  default = "1088347617355"
  description = "GCP Project Number"
}

variable "cloudrun_region" {
  type        = string
  default = "us-east1"
  description = "GCP region to deploy CloudRun"
}

variable "imageopt_svc_image" {
  type        = string
  default = "us-east1-docker.pkg.dev/img-optimization/img-optimization-repo-1088347617355/image-optimizer:latest"
  description = "Container image URL in Artifact Registry"
}

variable "origin_fqdn" {
  type        = string
  description = "Origin FQDN"
  default     = "www.google.com"
}

variable "origin_base_path" {
  type        = string
  description = "Origin base path for images"
  default     = "/original/"
}