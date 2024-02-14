# Google CDN Image Optimizer

## Use case
This Node.js module is for converting large images in common formats to smaller, web-friendly **JPEG**, **JPEG 2000**, **JPEG XL**, **PNG**, **WebP**, **GIF** and **AVIF** images of varying dimensions.

With the integration of [Cloud CDN Content Targeting](http://go/customer-cloud-cdn-modify-cache-key), you get the benefits of image optimization based on `device_type` and `user_agent_famliy` out of the box, with optional customizations of image **width**, **height**, and **quality**.

## Formats

This module supports reading **JPEG, PNG, WebP, GIF, AVIF, TIFF and SVG** images.

Output images can be in **JPEG**, **JPEG 2000**, **JPEG XL**, **PNG**, **WebP**, **GIF**, **AVIF** and **TIFF** formats as well as uncompressed **raw pixel data**.

## Diagrams
![Architecture_Diagram](./architecture_diagrams/CDN_ImageOptimization_Architecture_Diagram.png)

![Sequence_Flow_Diagram](./architecture_diagrams/Sequence_Flow_Diagram.png)


## Deploy to Cloud CDN via Terraform

1. Clone this repo.
   ```
   git clone https://github.com/CDN-guy/google-cdn-image-optimization.git
   ```

1. Change to the Infrastructure deployment directory.
   ```
   cd infra
   ```


1. Create a file named **infra.tfvars** under the **/infra** directory
    - Set the variable values for `project_id`, `project_number`, `cloudrun_region`, `origin_fqdn` and `origin_base_path` with your preference.
    - (leave `imageopt_svc_image` as default value - except you prefer to use a custom-built container image)

    | Variable      | Description |
    | ----------- | ----------- |
    | project_id      | GCP project ID       |
    | project_number   | GCP project Number        |
    | cloudrun_region   | Region where CloudRun should be deployed        |
    | origin_fqdn   | FQDN of origin server        |
    | origin_base_path   | Base Path of origin, default `/original/`        |

    ```
    variable "project_id" {
        type        = string
        default     = "xxxx"
        description = "Project ID"
    }

    variable "project_number" {
        type        = string
        default     = "xxxx"
        description = "Project Number"
    }

    variable "cloudrun_region" {
        type        = string
        default     = "us-east1"
        description = "Default region"
    }

    variable "imageopt_svc_image" {
        type        = string
        default     = "us-east1-docker.pkg.dev/img-optimization/img-optimization-repo-1088347617355/image-optimizer:latest"
        description = "Default region"
    }

    variable "origin_fqdn" {
        type        = string
        description = "FQDN of origin"
    }

    variable "origin_base_path" {
        type        = string
        description = "base path for images on origin"
        default     = "/original/"
    }
    ```


1. Run the following commands to initiate Terraform for deployment. 
    ```
    terraform init
    terraform plan -var-file="infra.tfvars"
    terraform apply -var-file="infra.tfvars" -auto-approve
    ```

## Deploy to Media CDN via Terraform & gCloud SDK

[Instruction for MediaCDN](src/media_cdn.md)

## Demo Pages

[Cloud CDN Demo Page](https://images.thegoogle.cloud/cdn-IO.html)

[Media CDN Demo Page](https://service-extensions.thegoogle.cloud/demo.html)