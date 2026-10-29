# Deploying to Oracle Cloud (Always Free)

Oracle Cloud Infrastructure (OCI) gives away compute forever on its **Always
Free** tier — not a trial. This gets PrakashAnalyser running on a real
server with a real domain and free auto-renewing HTTPS.

I can't do the account signup or server provisioning for you (needs your
identity and a card for verification, even though the tier itself never
charges you) — but every step below is exact, and once the server exists I
can SSH in and run the deploy commands myself if you'd like.

## 1. Sign up for OCI

1. Go to [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) → **Start for free**
2. Fill in your details. You'll need a phone number and a card for identity
   verification — Oracle does **not** charge the card unless you explicitly
   upgrade to a paid account later. Always Free resources stay free
   indefinitely.
3. Pick a **Home Region** carefully — Always Free resources are only
   available in your home region, and you can't easily change it later. Pick
   one close to your actual users.

## 2. Create the Always Free compute instance

1. OCI Console → ☰ menu → **Compute** → **Instances** → **Create instance**
2. Name it (e.g. `prakash-analyser`)
3. **Image and shape** → Edit:
   - Image: **Canonical Ubuntu 24.04**
   - Shape: click **Change shape** → **Ampere** → `VM.Standard.A1.Flex` → set
     **2 OCPUs / 12 GB memory** (Always Free covers up to 4 OCPUs / 24GB
     total across all your A1 instances — 2/12 leaves room to spare and is
     already more than this app needs)
   - If A1 capacity isn't available in your region, fall back to shape
     `VM.Standard.E2.1.Micro` (AMD, always free, smaller — still fine for
     this app)
4. **Add SSH keys**: let OCI generate a key pair and download the private
   key (or paste your own public key if you have one). You'll need this
   private key file to connect — save it somewhere safe, e.g.
   `~/.ssh/oracle-prakash.key`.
5. Leave networking on the default VCN it offers to create. **Create**.
6. Once it's "Running", note its **Public IP address** from the instance
   details page.

## 3. Open the firewall (the most common gotcha)

OCI blocks ports at **two layers** — both need opening, not just one.

**A. Security List (cloud-level firewall):**
1. Instance details page → the **Subnet** link → the **Security List** link
2. **Add Ingress Rules** → add two rules, both `0.0.0.0/0` source:
   - TCP, destination port `80`
   - TCP, destination port `443`

**B. The instance's own firewall (OS-level, Ubuntu's `iptables`):**
SSH in (see step 4 below) and run:
```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save   # if installed; otherwise the rule won't survive a reboot
```

## 4. Get a domain pointed at the server

You said Oracle's free tier covers hosting — it covers the **server**, but a
domain name is a separate thing you still need (Oracle doesn't give you
one). Fastest free option if you don't want to buy one yet:

1. Go to [duckdns.org](https://www.duckdns.org/), sign in (GitHub/Google),
   pick a subdomain, e.g. `prakashanalyser.duckdns.org`
2. Point it at your instance's public IP from step 2
3. Use `prakashanalyser.duckdns.org` wherever this guide says "your domain"

(If you'd rather buy a real domain — ~$10-15/year at Namecheap or Cloudflare
Registrar — just point its DNS **A record** at the same public IP instead,
and use that domain throughout.)

## 5. Connect and install Docker

```bash
ssh -i ~/.ssh/oracle-prakash.key ubuntu@<your-instance-public-ip>

# On the server:
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # log out and back in so the group change takes effect
```

## 6. Get the code onto the server

Easiest if this project is in a git repo you can push somewhere (GitHub,
etc.) — then on the server:
```bash
git clone <your-repo-url>
cd trendscope-us
```
Otherwise, copy the folder up directly from your machine (run this from
your machine, not the server):
```bash
scp -i ~/.ssh/oracle-prakash.key -r ./trendscope-us ubuntu@<ip>:~/
```

## 7. Configure and start it

On the server, inside the project folder:
```bash
cp .env.example .env.local
nano .env.local   # set DATA_PROVIDER=alpaca (or polygon) and your real keys

nano Caddyfile     # replace your-domain.example.com with your real domain

docker compose up -d --build
```

Caddy automatically requests and renews a free HTTPS certificate for your
domain the first time it starts, as long as:
- the domain's DNS already points at this server's IP (step 4), and
- ports 80 and 443 are actually reachable (step 3)

Check it's working:
```bash
docker compose logs -f caddy   # watch for certificate obtained
curl -I https://your-domain.example.com
```

## 8. Day-to-day

```bash
docker compose logs -f app     # app logs
docker compose pull && docker compose up -d --build   # redeploy after changes
docker compose down            # stop everything
```

## Once this is live

- The Android TWA build needs this live HTTPS URL — see `ANDROID.md`.
- Set `NEXT_PUBLIC_SITE_URL` (if you add one) or just hardcode the domain
  anywhere the app needs its own absolute URL.
