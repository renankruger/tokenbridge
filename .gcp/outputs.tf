output "wallet_url" {
  description = "URL of the created wallet"
  value       = google_cloud_run_v2_service.hathor-wallet.uri
}