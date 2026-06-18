#!/usr/bin/env python3
"""Find and fix port 3001 conflict on HP Z440."""
import paramiko

HOST = "192.168.1.8"
USER = "aetheris"
PASSWORD = "ButtFuck"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASSWORD, timeout=15)

# Find what's using port 3001
stdin, stdout, stderr = client.exec_command("ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null || echo 'no_ss'")
print("Active connections:")
print(stdout.read().decode())

# Check docker
stdin, stdout, stderr = client.exec_command("docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
print("Docker containers:")
print(stdout.read().decode())

# Try to kill whatever is on 3001
stdin, stdout, stderr = client.exec_command("fuser -k 3001/tcp 2>/dev/null || echo 'fuser not available'")
print("Kill attempt:", stdout.read().decode())

# Alternative: kill docker containers
stdin, stdout, stderr = client.exec_command("docker compose -f /opt/uat-tester/docker-compose.yml down 2>&1")
print("Docker down:", stdout.read().decode())

import time
time.sleep(2)

# Now try to start again
stdin, stdout, stderr = client.exec_command("cd /opt/uat-tester && docker compose up -d uat-tester 2>&1")
print("Start:", stdout.read().decode())

# Wait for it
for i in range(15):
    time.sleep(2)
    stdin2, stdout2, stderr2 = client.exec_command("curl -s http://localhost:3001/api/scripts", timeout=5)
    r = stdout2.read().decode()
    if r and r.startswith("["):
        import json
        d = json.loads(r)
        print(f"READY! {len(d)} scripts loaded")
        break
    print(f"Waiting... {i+1}/15")

client.close()
