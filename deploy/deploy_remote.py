#!/usr/bin/env python3
"""
Remote deployment script for UAT Tester on HP Z440.
Connects via SSH, transfers files, builds and starts the application.
"""
import paramiko
import os
import sys
import json

HOST = "192.168.1.8"
USER = "aetheris"
PASSWORD = "ButtFuck"
LOCAL_DIR = r"C:\Users\nolan\Downloads\Aetheris-Pathology-main (1)\uat-tester"
REMOTE_DIR = "/opt/uat-tester"

def run_cmd(client, cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err, exit_code

def sftp_mkdir(sftp, path):
    try:
        sftp.stat(path)
    except FileNotFoundError:
        parts = path.split("/")
        for i in range(1, len(parts) + 1):
            sub = "/".join(parts[:i])
            if sub:
                try:
                    sftp.stat(sub)
                except FileNotFoundError:
                    sftp.mkdir(sub)

def transfer_directory(sftp, local_dir, remote_dir):
    for root, dirs, files in os.walk(local_dir):
        # Calculate relative path
        rel = os.path.relpath(root, local_dir)
        if rel == ".":
            rem = remote_dir
        else:
            rem = remote_dir + "/" + rel.replace("\\", "/")
        
        # Skip node_modules and __pycache__
        skip_dirs = {"node_modules", "__pycache__", ".git", "venv"}
        dirs[:] = [d for d in dirs if d not in skip_dirs]
        
        sftp_mkdir(sftp, rem)
        for f in files:
            # Skip certain files
            if f in ("package-lock.json", ".DS_Store"):
                continue
            local_file = os.path.join(root, f)
            remote_file = rem + "/" + f
            try:
                sftp.stat(remote_file)
                # File exists, check size
                local_size = os.path.getsize(local_file)
                remote_size = sftp.stat(remote_file).st_size
                if local_size == remote_size and f.endswith((".json", ".js", ".html", ".css", ".yml", ".sh", ".env")):
                    continue  # Skip if same size and it's a text/config file
            except FileNotFoundError:
                pass
            print(f"  Uploading: {rel}\\{f}")
            sftp.put(local_file, remote_file)

def main():
    print("=" * 60)
    print("  UAT Tester - Remote Deployment to HP Z440")
    print("  Target: {}@{}".format(USER, HOST))
    print("=" * 60)
    
    # Connect
    print("\n[1/6] Connecting to server...")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        client.connect(HOST, username=USER, password=PASSWORD, timeout=15)
        print("  Connected!")
        
        # Check system
        print("\n[2/6] Checking system...")
        out, err, code = run_cmd(client, "hostname")
        print(f"  Hostname: {out}")
        
        out, err, code = run_cmd(client, "docker --version 2>/dev/null || echo 'NOT INSTALLED'")
        print(f"  Docker: {out}")
        
        if "NOT INSTALLED" in out:
            print("\n  ERROR: Docker is not installed on the server!")
            print("  Please install Docker first:")
            print("    curl -fsSL https://get.docker.com | sh")
            print("    sudo usermod -aG docker $USER")
            client.close()
            sys.exit(1)
        
        out, err, code = run_cmd(client, "docker compose version 2>/dev/null || echo 'NOT INSTALLED'")
        print(f"  Compose: {out}")
        
        out, err, code = run_cmd(client, "free -h | grep Mem")
        print(f"  Memory: {out}")
        
        out, err, code = run_cmd(client, "df -h / | tail -1")
        print(f"  Disk: {out}")
        
        out, err, code = run_cmd(client, "uname -a")
        print(f"  OS: {out}")
        
        # Create remote directory
        print("\n[3/6] Creating remote directory...")
        run_cmd(client, f"sudo mkdir -p {REMOTE_DIR} && sudo chown -R {USER}:{USER} {REMOTE_DIR}")
        print(f"  {REMOTE_DIR} created")
        
        # Transfer files via SFTP
        print("\n[4/6] Transferring files (this will take a moment)...")
        sftp = client.open_sftp()
        
        # List of files/dirs to exclude from transfer
        exclude_dirs = {"node_modules", "__pycache__", ".git", "venv", "screenshots", "reports", "runs"}
        
        for item in os.listdir(LOCAL_DIR):
            if item in exclude_dirs:
                continue
            local_path = os.path.join(LOCAL_DIR, item)
            remote_path = f"{REMOTE_DIR}/{item}"
            
            if os.path.isdir(local_path):
                print(f"  Directory: {item}/")
                transfer_directory(sftp, local_path, remote_path)
            elif os.path.isfile(local_path):
                if item == "package-lock.json":
                    continue
                print(f"  File: {item}")
                sftp.put(local_path, remote_path)
        
        sftp.close()
        print("  Transfer complete!")
        
        # Install SSH key for future access
        print("\n[5/6] Installing SSH key for future passwordless access...")
        ssh_key_path = os.path.expanduser("~/.ssh/id_ed25519.pub")
        if os.path.exists(ssh_key_path):
            with open(ssh_key_path, "r") as f:
                pubkey = f.read().strip()
            run_cmd(client, f"mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '{pubkey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys")
            print("  SSH key installed!")
        
        # Build and start
        print("\n[6/6] Building and starting Docker containers...")
        print("  (This may take 5-10 minutes on first run)")
        
        out, err, code = run_cmd(client, f"cd {REMOTE_DIR} && docker compose build --pull uat-tester 2>&1", timeout=600)
        if code != 0:
            print(f"  Build output: {out[:500]}")
            print(f"  Build errors: {err[:500]}")
            print("  Build may have warnings but continuing...")
        
        out, err, code = run_cmd(client, f"cd {REMOTE_DIR} && docker compose up -d 2>&1", timeout=60)
        print(f"  Start output: {out}")
        if err:
            print(f"  Start errors: {err}")
        
        # Wait for it to be ready
        import time
        print("\n  Waiting for UAT Tester to start...")
        for i in range(20):
            time.sleep(3)
            out, err, code = run_cmd(client, "curl -s http://localhost:3001/api/scripts", timeout=5)
            if out and "[" in out:
                print(f"  ✓ UAT Tester is ready! (attempt {i+1})")
                break
            print(f"  Waiting... (attempt {i+1})")
        
        # Final check
        print("\n" + "=" * 60)
        print("  DEPLOYMENT RESULT")
        print("=" * 60)
        
        out, err, code = run_cmd(client, "curl -s http://localhost:3001/api/scripts | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d), \"scripts loaded\")' 2>/dev/null || echo 'check manually'")
        print(f"  Local: http://localhost:3001")
        print(f"  Status: {out}")
        
        cfg, _, _ = run_cmd(client, "curl -s http://localhost:3001/api/config | python3 -c 'import sys,json;c=json.load(sys.stdin);print(\"  Browser: \"+c.get(\"browser\",\"?\")+\", Headless: \"+str(c.get(\"headless\",\"?\")))' 2>/dev/null || true")
        if cfg:
            print(cfg)
        
        print("\n  To set up Cloudflare Tunnel for public URL:")
        print("    ssh aetheris@" + HOST)
        print("    cd /opt/uat-tester")
        print("    docker compose run --rm cloudflare-tunnel tunnel login")
        print("    docker compose run --rm cloudflare-tunnel tunnel create uat-tester")
        print("    docker compose run --rm cloudflare-tunnel route dns uat-tester UATAPPv1.aetheriscloudgroup.uk")
        print("    cp ~/.cloudflared/*.json cloudflared/credentials.json")
        print("    docker compose up -d cloudflare-tunnel")
        print("\n  Public URL: https://UATAPPv1.aetheriscloudgroup.uk")
        print("=" * 60)
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        client.close()

if __name__ == "__main__":
    main()
