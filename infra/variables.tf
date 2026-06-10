variable "cloudflare_api_token" {
  description = "Cloudflare API token (Zone:Edit, Workers KV:Edit, DNS:Edit). Pass via TF_VAR_cloudflare_api_token; never hardcode."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account id that owns the zone and KV namespace."
  type        = string
}

variable "zone_name" {
  description = "Apex domain managed by this configuration."
  type        = string
  default     = "meditor.dev"
}
