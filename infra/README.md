# infra

Terraform for the Cloudflare infrastructure behind `meditor.dev`: zone, root DNS,
KV namespace, and the publish rate-limit. **Terraform owns infrastructure;
Wrangler owns the Worker code deploy** (see `../worker`). Do not deploy the
Worker script from Terraform — infra changes rarely, code changes constantly.

## Usage

```bash
export TF_VAR_cloudflare_api_token=...   # Zone:Edit, Workers KV:Edit, DNS:Edit
export TF_VAR_account_id=...

terraform init      # configure a remote backend first (see main.tf)
terraform plan
terraform apply     # manual / reviewed only
```

After `apply`:

1. Copy `kv_namespace_id` output into `../worker/wrangler.toml`.
2. Set the `name_servers` output at the domain registrar (or register the domain
   in the Cloudflare Registrar so this is automatic).
3. Uncomment the custom-domain `routes` block in `wrangler.toml` and redeploy the
   Worker.

State contains secrets — it is gitignored and must live in a remote backend,
never committed.
