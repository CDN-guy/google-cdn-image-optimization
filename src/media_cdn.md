## Image Optimizer on Media CDN deployment instruction

> Caution: Media CDN requires an allowlist process. Please make sure that your project is allowlisted before proceeding.
>
> To request access to Media CDN, contact your Google Cloud sales representative or your account team.


we will be deploying Media CDN and Image Optimizer running on Cloud Run using Terraform

1. Clone this repo.
   ```
   git clone https://github.com/CDN-guy/google-cdn-image-optimization.git
   ```

1. Change to the Infra_mcdn directory.
   ```
   cd infra_mcdn
   ```

1. Create a file named **infra_mcdn.tfvars** under the **infra_mcdn** directory
    - Set the variable values for `project_id`, `project_number`, `cloudrun_region`, `origin_fqdn` and `origin_base_path` with your preference.
    - (leave `imageopt_svc_image` as default value - except you prefer to use a custom-built container image [follow bootstrap.sh])

    example:

    ```
    project_id = "abc123xyz"
    project_number = "1111111111111"
    cloudrun_region = "us-central1"
    origin_fqdn = "www.google.com"
    origin_base_path = "/"
    ```

    | Variable      | Description |
    | ----------- | ----------- |
    | project_id      | GCP project ID       |
    | project_number   | GCP project Number        |
    | cloudrun_region   | Region where CloudRun should be deployed        |
    | origin_fqdn   | FQDN of origin server        |
    | origin_base_path   | Base Path of origin        |


1. Run the following commands to initiate Terraform for deployment. 
    ```
    terraform init
    terraform plan -var-file="infra_mcdn.tfvars"
    terraform apply -var-file="infra_mcdn.tfvars" -auto-approve
    ```
