output "kv_namespace_id" {
  description = "Paste into worker/wrangler.toml as the SHARES binding id."
  value       = cloudflare_workers_kv_namespace.shares.id
}

output "zone_id" {
  description = "Cloudflare zone id for meditor.dev."
  value       = cloudflare_zone.meditor.id
}

output "name_servers" {
  description = "Set these at the registrar to delegate the domain to Cloudflare."
  value       = cloudflare_zone.meditor.name_servers
}
