# Section1: Image Optimization on Cloud Run w/ Global External HTTP(s) Load Balancer 
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
        limits = {cpu = 6, memory = "8Gi"}
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
  provider              = google
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

  enable_cdn  = false
  
  backend {
    group = google_compute_region_network_endpoint_group.imageopt_svc_neg.id
  }

}

# reserved LB IP address
resource "google_compute_global_address" "imageopt-lb-ip" {
  provider = google
  name = "imageopt-lb-static-ip"
}

# LB url map
resource "google_compute_url_map" "imageopt_lb_url_map" {
  name            = "imageopt-lb"
  default_service = google_compute_backend_service.imageopt_serverless_backend.id

  host_rule {
    hosts        = ["*"]
    path_matcher = "allpaths"
  }

  path_matcher {
    name            = "allpaths"
    default_service = google_compute_backend_service.imageopt_serverless_backend.id
  }
}
# http proxy
resource "google_compute_target_http_proxy" "imageopt_http_proxy" {
  name    = "imageopt-http-proxy"
  url_map = google_compute_url_map.imageopt_lb_url_map.id
}

# forwarding rule
resource "google_compute_global_forwarding_rule" "imageopt_global_fwding_rule" {
  provider              = google
  name                  = "imageopt-global-rule"
  target                = google_compute_target_http_proxy.imageopt_http_proxy.id
  port_range            = "80"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.imageopt-lb-ip.id
}

# Section2: Media CDN 
# MCDN Edge Cache Origin
resource "google_network_services_edge_cache_origin" "image-opt-cr-origin" {
  name                 = "img-opt-cloud-run"
  origin_address       = google_compute_global_address.imageopt-lb-ip.address
  description          = "The External LB IP for Image Optimization Engine"
  protocol = "HTTP"
  port = 80
}

resource "google_network_services_edge_cache_origin" "primitive-origin" {
  name                 = "primitive-origin"
  origin_address       = var.origin_fqdn
  description          = "The FQDN for Origin"
  origin_override_action {
    url_rewrite {
      host_rewrite = var.origin_fqdn
    }
  }
}

# MCDN Edge Cache service
resource "google_network_services_edge_cache_service" "image-opt-cdn" {
  name                 = "image_opt"
  description          = "MediaCDN configuration w/ image optimization"
  routing {
    host_rule {
      description = "host rule description"
      hosts = ["*"]
      path_matcher = "routes"
    }
    path_matcher {
      name = "routes"
      route_rule {
        description = "a route rule to match against"
        priority = 200
        match_rule {
          prefix_match = var.origin_base_path
        }
        origin = google_network_services_edge_cache_origin.image-opt-cr-origin.name
        route_action {
          cdn_policy {
              cache_mode = "FORCE_CACHE_ALL"
              default_ttl = "3600s"
              cache_key_policy {
                include_protocol = false
                exclude_host = false
                included_header_names = ["x-client-device-type", "x-client-ua-family"]
              }
          }
          url_rewrite {
            path_prefix_rewrite = "/images/"
          }
        }
        header_action {
          request_header_to_add {
            header_name = "x-client-device-type"
            header_value = "{device_request_type}"
            replace = true
          }
          request_header_to_add {
            header_name = "x-client-ua-family"
            header_value = "{user_agent_family}"
            replace = true
          }
          request_header_to_add {
            header_name = "x-client-host"
            header_value = "{tls_sni_hostname}"
            replace = true
          }
          response_header_to_add {
            header_name = "x-mcdn-cache-status"
            header_value = "{cdn_cache_status}"
            replace = true
          }
        }
      }
      route_rule {
        description = "a route rule to match against"
        priority = 100
        match_rule {
          prefix_match = "/original/"
        }
        origin = google_network_services_edge_cache_origin.primitive-origin.name
        route_action {
          cdn_policy {
              cache_mode = "FORCE_CACHE_ALL"
              default_ttl = "3600s"
          }
          url_rewrite {
            path_prefix_rewrite = var.origin_base_path
          }
        }
        header_action {
          response_header_to_add {
            header_name = "x-mcdn-cache-status"
            header_value = "{cdn_cache_status}"
            replace = true
          }
        }
      }
      route_rule {
        description = "a route rule to match against"
        priority = 300
        match_rule {
          prefix_match = "/"
        }
        origin = google_network_services_edge_cache_origin.primitive-origin.name
        route_action {
          cdn_policy {
              cache_mode = "FORCE_CACHE_ALL"
              default_ttl = "3600s"
          }
        }
        header_action {
          response_header_to_add {
            header_name = "x-mcdn-cache-status"
            header_value = "{cdn_cache_status}"
            replace = true
          }
        }
      }
    } 
  }
  log_config {
    enable = true
    sample_rate = 1
  }
}