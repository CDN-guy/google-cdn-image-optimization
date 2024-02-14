## Image Optimization on Media CDN deployment instruction

> Caution: Media CDN and Service Extensions on Media CDN require an allowlist process. Please make sure that your project is allowlisted before proceeding.
>
> To request access to Media CDN and Service Extensions on Media CDN, contact your Google Cloud sales representative or your account team.


### Step 1: Deploy Media CDN and Image Optimization Engine on CloudRun
we will be deploying Media CDN configuration and the Cloud Run Image Optimizaiton container using Terraform

1. Clone this repo.
   ```
   git clone https://github.com/CDN-guy/google-cdn-image-optimization.git
   ```

1. Change to the Infra_mcdn directory.
   ```
   cd infra_mcdn
   ```

1. Create a file named **infra_mcdn.tfvars** under the **/infra_mcdn** directory
    - Set the variable values for `project_id`, `project_number`, `cloudrun_region`, `origin_fqdn` and `origin_base_path` with your preference.
    - (leave `imageopt_svc_image` as default value - except you prefer to use a custom-built container image)

    example:

    ```
    project_id = "img-optimization"
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
    | origin_base_path   | Base Path of origin, default `/original/`        |


1. Run the following commands to initiate Terraform for deployment. 
    ```
    terraform init
    terraform plan -var-file="infra_mcdn.tfvars"
    terraform apply -var-file="infra_mcdn.tfvars" -auto-approve
    ```

### Step 2: Deploy Service Extensions plugin
Next, we will deploy the Service Extensions Image-Opt plugin. The plugin will be responsible for identifying device type & broswer family, then signaling the Image Optimization Engine to select the optimal Image transformations. We will be using **gcloud** SDK in this section. 

> **plugin container image**
>
> us-east1-docker.pkg.dev/img-optimization/img-optimization-repo-1088347617355/img-opt-plugin:v1.0.2

1. Create a Wasm-plugin resource for our Proxy-Wasm plugin.
    ```
    gcloud alpha service-extensions wasm-plugins create img-opt-plugin-resource
    ```
1. Create a WasmPluginVersion.
    ```
    gcloud alpha service-extensions wasm-plugin-versions create v1 \
        --wasm-plugin=img-opt-plugin-resource \
        --image="us-east1-docker.pkg.dev/img-optimization/img-optimization-repo-1088347617355/img-opt-plugin:v1.0.2" \
        --plugin-config-file=../src/media_cdn_wasm/src/regex.yaml
    ```
1. Specify the main version for our Proxy-Wasm plugin.
    ```
    gcloud alpha service-extensions wasm-plugins update img-opt-plugin-resource \
        --main-version=v1
    ```
1. Create a WasmAction resource referencing our Wasm plugin resource.
    ```
    gcloud alpha service-extensions wasm-actions create img-opt-plugin-action \
        --wasm-plugin=img-opt-plugin-resource
    ```

### Step 3: Associate Service Extensions plugin with Media CDN
Lastly, we will associate the Service Extensions plugin created in step 2 to Media CDN. We will be using **gcloud** SDK in this section. 

1. Export the Media CDN configuration to a YAML file.
    ```
    gcloud edge-cache services export image_opt \
        --destination=image_opt.yaml
    ```
1. Update the routes in the file to add the wasmAction attribute as shown in the following example:

    > WASM_ACTION: the Service Extensions WASM action

    ```
    routing:
    hostRules:
    - description: host rule description
        hosts:
        - '*'
        pathMatcher: routes
    pathMatchers:
    - name: routes
        routeRules:
        - description: a route rule to match against
        headerAction:
            responseHeadersToAdd:
            - headerName: x-mcdn-cache-status
            headerValue: '{cdn_cache_status}'
            replace: true
        matchRules:
        - prefixMatch: /images/
        origin: projects/PROJECT_NUMBER/locations/global/edgeCacheOrigins/img-opt-cr-origin
        priority: 200
        routeAction:
            wasmAction: projects/PROJECT_NUMBER/locations/global/wasmActions/img-opt-plugin-action
            cdnPolicy:
            cacheKeyPolicy:
                includedHeaderNames:
                - x-client-device-type
                - x-client-ua-family
            cacheMode: FORCE_CACHE_ALL
            defaultTtl: 3600s
    ```
1. Import the updated config file using gcloud edge-cache services import command:

    ```
    gcloud edge-cache services import image_opt \
        --source=image_opt.yaml
    ```
