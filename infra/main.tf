terraform {
  required_version = ">= 1.6"

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # Pinned: the Cloudflare provider renames resources/attributes between
      # majors (v4 -> v5). Validate the HCL below against the locked version
      # before bumping. `terraform init -upgrade` only within v4.
      version = "~> 4.40"
    }
  }

  # State holds secrets (KV ids, tokens) — never commit terraform.tfstate.
  # Configure a remote backend (Terraform Cloud free tier) before `apply`:
  #
  # cloud {
  #   organization = "addodelgrossi"
  #   workspaces { name = "meditor-cloud" }
  # }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# The zone for meditor.dev. Register the domain in the Cloudflare Registrar
# (at-cost) so registration and DNS live in one place.
resource "cloudflare_zone" "meditor" {
  account_id = var.account_id
  zone       = var.zone_name
}

# KV namespace backing the share service. Its id goes into worker/wrangler.toml.
resource "cloudflare_workers_kv_namespace" "shares" {
  account_id = var.account_id
  title      = "meditor-shares"
}

# Root record so the Worker routes resolve. The domain lives entirely behind the
# Worker, so a placeholder proxied AAAA is the canonical pattern.
resource "cloudflare_record" "root" {
  zone_id = cloudflare_zone.meditor.id
  name    = "@"
  type    = "AAAA"
  content = "100::"
  proxied = true
  ttl     = 1
}

# Rate-limit: at most 10 publishes per 10 minutes per IP. The free plan includes
# one rate-limiting rule, which this consumes.
resource "cloudflare_ruleset" "rate_limit" {
  zone_id = cloudflare_zone.meditor.id
  name    = "rate-limit-publish"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules {
    action      = "block"
    description = "Throttle diagram publishing"
    expression  = "(starts_with(http.request.uri.path, \"/api/v1/share\") and http.request.method eq \"POST\")"

    ratelimit {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 600
      requests_per_period = 10
      mitigation_timeout  = 600
    }
  }
}
