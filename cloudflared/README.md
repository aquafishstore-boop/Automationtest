# Cloudflare Tunnel Setup for UATAPPv1.aetheriscloudgroup.uk

## Prerequisites

- Cloudflare account with `aetheriscloudgroup.uk` zone
- Docker installed on HP Z440

## Step 1: Authenticate Cloudflared

```bash
docker compose run --rm cloudflare-tunnel tunnel login
```

This opens a browser window — authenticate with your Cloudflare account.

## Step 2: Create the Tunnel

```bash
docker compose run --rm cloudflare-tunnel tunnel create uat-tester
```

This creates `~/.cloudflared/<tunnel-id>.json`. Copy it:

```bash
cp ~/.cloudflared/<tunnel-id>.json cloudflared/credentials.json
```

## Step 3: Update config.yml

Edit `cloudflared/config.yml` and update the `tunnel` field to your tunnel ID:

```yaml
tunnel: <your-tunnel-id>
```

## Step 4: Route DNS

```bash
docker compose run --rm cloudflare-tunnel route dns uat-tester UATAPPv1.aetheriscloudgroup.uk
```

## Step 5: Start

```bash
docker compose up -d
```

## Verify

```bash
curl https://UATAPPv1.aetheriscloudgroup.uk/api/scripts
```

## Troubleshooting

```bash
# Check tunnel logs
docker compose logs cloudflare-tunnel

# Check tunnel status
docker compose run --rm cloudflare-tunnel tunnel info uat-tester

# Restart tunnel
docker compose restart cloudflare-tunnel
```
