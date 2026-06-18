#!/bin/bash
# UAT Tester VM Setup — Docker + Cloudflare Tunnel
set -euo pipefail

# Install Docker
curl -fsSL https://get.docker.com | bash
usermod -aG docker ${admin_username}

# Install Docker Compose plugin
apt-get update && apt-get install -y docker-compose-plugin

# Clone the UAT Tester repo
cd /opt
git clone https://github.com/aquafishstore-boop/Automationtest.git uat-tester
cd uat-tester

# Create environment file
cat > .env << 'EOF'
NODE_ENV=production
HEADLESS=true
BROWSER=msedge
LM_HOST=http://192.168.1.19:1234
LM_API_TOKEN=sk-lm-UHHmsc7R:Y7LZSDmCWypyemdHnsQA
AI_MODEL=openai/gpt-oss-20b
LM_FALLBACK_HOST=http://192.168.1.8:11434
AI_FALLBACK_MODEL=pathology-eqa:latest
UAT_BROWSER=msedge
UAT_HEADLESS=true
EOF

# Create custom scripts directory
mkdir -p custom-scripts

# Start the stack
docker compose up -d

echo "UAT Tester deployed in ${environment} region"
echo "Access: https://UATAPPv1.aetheriscloudgroup.uk"
