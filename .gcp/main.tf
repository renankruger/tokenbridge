provider "google" {
  project = var.gcp_project_id
}

variable "federator_number" {
  type = number
}

variable "wallet_seed" {
  type      = string
  sensitive = true
}

variable "wallet_network" {
  type = string
}

variable "wallet_server" {
  type = string
}

variable "wallet_multisig_max_signatures" {
  type = number
}

variable "wallet_multisig_num_signatures" {
  type = number
}

variable "wallet_pubkeys" {
  type      = string
  sensitive = true
}

variable "wallet_debug_long" {
  type = string
}

variable "wallet_enabled_plugins" {
  type = string
}

variable "wallet_plugin_name" {
  type = string
}

variable "wallet_plugin_file" {
  type = string
}

variable "federator_key" {
  type      = string
  sensitive = true
}

variable "etherscan_key" {
  type      = string
  sensitive = true
}

variable "evm_network" {
  type = string
}

variable "bridge_address" {
  type = string
}

variable "federation_address" {
  type = string
}

variable "evm_multisig_address" {
  type = string
}

variable "allow_tokens_address" {
  type = string
}

variable "evm_chain_id" {
  type = number
}

variable "test_token" {
  type = string
}

variable "evm_host" {
  type      = string
  sensitive = true
}

variable "from_block" {
  type = number
}

variable "hathor_network" {
  type = string
}

variable "hathor_chain_id" {
  type = number
}

variable "hathor_min_confirmations" {
  type = number
}

variable "gcp_project_id" {
  type = string
}

variable "gcp_repository" {
  type = string
}

variable "wallet_key" {
  type      = string
  sensitive = true
}

resource "google_pubsub_topic" "hathor-topic" {
  name = "hathor-federator-${var.federator_number}"
}

resource "google_cloud_run_v2_service" "hathor-wallet" {
  name     = "hathor-wallet-${var.federator_number}"
  location = "us-central1"
  client   = "terraform"
  # ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    containers {
      image = "us-central1-docker.pkg.dev/${var.gcp_project_id}/${var.gcp_repository}/hathor-wallet-pubsub:latest"

      env {
        name  = "HEADLESS_SEED_DEFAULT"
        value = var.wallet_seed
      }
      env {
        name  = "HEADLESS_API_KEY"
        value = var.wallet_key
      }
      env {
        name  = "HEADLESS_NETWORK"
        value = var.wallet_network
      }
      env {
        name  = "HEADLESS_SERVER"
        value = var.wallet_server
      }
      env {
        name  = "HEADLESS_MULTISIG_SEED_DEFAULT_MAX_SIGNATURES"
        value = var.wallet_multisig_max_signatures
      }
      env {
        name  = "HEADLESS_MULTISIG_SEED_DEFAULT_NUM_SIGNATURES"
        value = var.wallet_multisig_num_signatures
      }
      env {
        name  = "HEADLESS_MULTISIG_SEED_DEFAULT_PUBKEYS"
        value = var.wallet_pubkeys
      }
      env {
        name  = "HEADLESS_ENABLED_PLUGINS"
        value = var.wallet_enabled_plugins
      }
      env {
        name  = "HEADLESS_PLUGIN_DEBUG_LONG"
        value = var.wallet_debug_long
      }
      env {
        name  = "HEADLESS_PLUGIN_PUBSUB_NAME"
        value = var.wallet_plugin_name
      }
      env {
        name  = "HEADLESS_PLUGIN_PUBSUB_FILE"
        value = var.wallet_plugin_file
      }
      env {
        name  = "HEADLESS_PLUGIN_PUBSUB_PROJECT"
        value = var.gcp_project_id
      }
      env {
        name  = "HEADLESS_PLUGIN_PUBSUB_TOPIC_NAME"
        value = google_pubsub_topic.hathor-topic.name
      }
      ports {
        name           = "http1"
        container_port = 8000
      }
      startup_probe {
        failure_threshold     = 5
        initial_delay_seconds = 30
        timeout_seconds       = 3
        period_seconds        = 10
        http_get {
          path = "/"
          port = 8000
          http_headers {
            name  = "X-API-Key"
            value = var.wallet_key
          }
        }
      }
      liveness_probe {
        http_get {
          path = "/"
          port = 8000
          http_headers {
            name  = "X-API-Key"
            value = var.wallet_key
          }
        }
        initial_delay_seconds = 30
        period_seconds        = 60
      }
      resources {
        cpu_idle = false
        limits = {
          memory = "4Gi"
        }
      }
    }

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
  }

  depends_on = [google_pubsub_topic.hathor-topic]
}

locals {
  htr_config = "{\"name\":\"${var.hathor_network}\",\"chainId\":${var.hathor_chain_id},\"fromBlock\":0,\"walletUrl\":\"${google_cloud_run_v2_service.hathor-wallet.uri}\",\"walletKey\":\"${var.wallet_key}\",\"singleWalletId\":\"single\",\"singleSeedKey\":\"default\",\"multisigWalletId\":\"multi\",\"multisigSeedKey\":\"default\",\"multisigRequiredSignatures\":${var.wallet_multisig_num_signatures},\"multisigOrder\":${var.federator_number},\"minimumConfirmations\":${var.hathor_min_confirmations},\"eventQueueType\":\"pubsub\",\"pubsubProjectId\":\"${var.gcp_project_id}\"}"
  evm_config = "{\"name\":\"${var.evm_network}\",\"bridge\":\"${var.bridge_address}\",\"federation\":\"${var.federation_address}\",\"multiSig\":\"${var.evm_multisig_address}\",\"allowTokens\":\"${var.allow_tokens_address}\",\"chainId\":${var.evm_chain_id},\"testToken\":\"${var.test_token}\",\"host\":\"${var.evm_host}\",\"fromBlock\":${var.from_block}}"
}

resource "google_cloud_run_v2_service" "hathor-federator" {
  name     = "hathor-federator-${var.federator_number}"
  location = "us-central1"
  client   = "terraform"
  # ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    containers {
      image = "us-central1-docker.pkg.dev/${var.gcp_project_id}/${var.gcp_repository}/hathor-tokenbridge:latest"

      env {
        name  = "EVM_CONFIG"
        value = local.evm_config
      }
      env {
        name  = "HTR_CONFIG"
        value = local.htr_config
      }
      env {
        name  = "FEDERATOR_KEY"
        value = var.federator_key
      }
      env {
        name  = "ETHERSCAN_KEY"
        value = var.etherscan_key
      }
      ports {
        name           = "http1"
        container_port = 8000
      }
      startup_probe {
        failure_threshold     = 5
        initial_delay_seconds = 30
        timeout_seconds       = 3
        period_seconds        = 10
        http_get {
          path = "/isAlive"
          port = 5000
        }
      }
      liveness_probe {
        http_get {
          path = "/isAlive"
          port = 5000
        }
        initial_delay_seconds = 30
        period_seconds        = 60
      }
      resources {
        cpu_idle = false
        limits = {
          memory = "4Gi"
        }
      }
    }

    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }
  }

  depends_on = [google_pubsub_topic.hathor-topic, google_cloud_run_v2_service.hathor-wallet]
}

resource "google_cloud_run_v2_service_iam_member" "noauth" {
  location = google_cloud_run_v2_service.hathor-wallet.location
  name     = google_cloud_run_v2_service.hathor-wallet.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}