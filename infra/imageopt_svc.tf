# CloudRun service
resource "google_cloud_run_v2_service" "imageopt_svc" {
  name     = "imageopt-svc"
  location = var.cloudrun_region
  project  = var.project_id
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  
  template {
    scaling {
      min_instance_count = 1
      max_instance_count = 10
    }

    containers {
      image = var.imageopt_svc_image
      resources {
        limits = {cpu = 6, memory = "8GiB"}
        cpu_idle = true
        startup_cpu_boost = true
      }
    }
  }
}

# CloudRun IAM
resource "google_cloud_run_v2_service_iam_binding" "imageopt_svc_unauthenticated_invoke" {
  location = google_cloud_run_v2_service.imageopt_svc.location
  name  = google_cloud_run_v2_service.imageopt_svc.name
  role     = "roles/run.invoker"
  members = [
    "allUsers"
  ]
}

# HTTP Load Balancer

# Serverless Network Endpoint Group 
resource "google_compute_region_network_endpoint_group" "imageopt_svc_neg" {
  provider              = google-beta
  name                  = "imageopt-svc-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.cloudrun_region
  cloud_run {
    service = google_cloud_run_v2_service.imageopt_svc.name
  }
}

# Serverless backend service
resource "google_compute_backend_service" "imageopt_serverless_backend" {
  name        = "imageopt-serverless-backend-service"
  load_balancing_scheme = "EXTERNAL_MANAGED"

  enable_cdn  = true
  cdn_policy {
    cache_mode = "FORCE_CACHE_ALL"
    default_ttl = 3600
    client_ttl  = 3600
    negative_caching = false

    cache_key_policy {
      include_http_headers = ["x-client-ua-family", "x-client-device-type"]
      query_string_whitelist = ["w", "h", "f", "q", "p", "fit"]
    }
  }

  custom_request_headers          = ["x-client-ua-family: {user_agent_family}", "x-client-device-type: {device_request_type}"]
  custom_response_headers         = ["x-cache-status: {cdn_cache_status}","x-client-ua-family: {user_agent_family}", "x-client-device-type: {device_request_type}"]

  backend {
    group = google_compute_region_network_endpoint_group.imageopt_svc_neg.id
  }

}

# Internet Network Endpoint Group
resource "google_compute_global_network_endpoint_group" "internet_neg" {
  provider              = google-beta
  name                  = "internet-neg"
  network_endpoint_type = "INTERNET_FQDN_PORT"
  default_port          = "443"
}

# Internet Endpoint
resource "google_compute_global_network_endpoint" "internet_endpoint" {
  provider              = google-beta
  global_network_endpoint_group = google_compute_global_network_endpoint_group.internet_neg.name
  fqdn       = var.origin_fqdn
  port       = google_compute_global_network_endpoint_group.internet_neg.default_port
}

# Internet NEG Backend Service
resource "google_compute_backend_service" "internet_backend" {
  provider              = google-beta
  name        = "internet-backend-service"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"

  enable_cdn  = true
  timeout_sec                     = 10
  connection_draining_timeout_sec = 10
  cdn_policy {
    cache_mode = "FORCE_CACHE_ALL"
    default_ttl = 3600
    client_ttl  = 3600
    negative_caching = false

    signed_url_cache_max_age_sec = 7200

  }

  custom_response_headers         = ["x-cache-status: {cdn_cache_status}"]

  backend {
    group = google_compute_global_network_endpoint_group.internet_neg.id
  }

}


# reserved LB IP address
resource "google_compute_global_address" "imageopt-lb-ip" {
  provider = google-beta
  name = "imageopt-lb-static-ip"
}

# LB url map
resource "google_compute_url_map" "imageopt_lb_url_map" {
  name            = "imageopt-url-map"
  default_service = google_compute_backend_service.internet_backend.id

  host_rule {
    hosts        = ["*"]
    path_matcher = "allpaths"
  }

  path_matcher {
    name            = "allpaths"
    default_service = google_compute_backend_service.internet_backend.id

    path_rule {
      paths   = ["${var.origin_base_path}*"]
      service = google_compute_backend_service.internet_backend.id
    }

    path_rule {
      paths   = ["/images/*"]
      service = google_compute_backend_service.imageopt_serverless_backend.id
    }
  }
}
# http proxy
resource "google_compute_target_http_proxy" "imageopt_http_proxy" {
  name    = "imageopt-http-proxy"
  url_map = google_compute_url_map.imageopt_lb_url_map.id
}

# forwarding rule
resource "google_compute_global_forwarding_rule" "imageopt_global_fwding_rule" {
  provider              = google-beta
  name                  = "imageopt-global-rule"
  target                = google_compute_target_http_proxy.imageopt_http_proxy.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.imageopt-lb-ip.id
}
