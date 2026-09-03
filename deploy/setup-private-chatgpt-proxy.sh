#!/usr/bin/env bash
set -euo pipefail

proxy_user="wisdomproxy"
public_key_base64="${1:-}"

if [[ -z "$public_key_base64" ]]; then
  echo "A base64-encoded SSH public key is required." >&2
  exit 1
fi

public_key="$(printf '%s' "$public_key_base64" | base64 --decode)"
if [[ ! "$public_key" =~ ^ssh-ed25519\  ]]; then
  echo "Only an Ed25519 public key is accepted." >&2
  exit 1
fi

if ! id "$proxy_user" >/dev/null 2>&1; then
  useradd --create-home --shell /usr/sbin/nologin "$proxy_user"
fi

proxy_home="$(getent passwd "$proxy_user" | cut -d: -f6)"
install -d -m 700 -o "$proxy_user" -g "$proxy_user" "$proxy_home/.ssh"
authorized_key="restrict,port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ${public_key}"
printf '%s\n' "$authorized_key" > "$proxy_home/.ssh/authorized_keys"
chown "$proxy_user:$proxy_user" "$proxy_home/.ssh/authorized_keys"
chmod 600 "$proxy_home/.ssh/authorized_keys"

random_password="$(openssl rand -base64 36)"
printf '%s:%s\n' "$proxy_user" "$random_password" | chpasswd
unset random_password

sshd_fragment="$(mktemp)"
cat > "$sshd_fragment" <<'EOF'
Match User wisdomproxy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding yes
    PermitListen 127.0.0.1:18443
    AllowAgentForwarding no
    X11Forwarding no
    PermitTTY no
    PermitTunnel no
    GatewayPorts no
Match all
EOF
install -m 644 "$sshd_fragment" /etc/ssh/sshd_config.d/90-wisdomproxy.conf
rm -f "$sshd_fragment"

sshd -t
if systemctl is-active --quiet ssh; then
  systemctl reload ssh
else
  systemctl reload sshd
fi

acme_root="/var/www/letsencrypt"
bootstrap_site="/etc/nginx/sites-enabled/wisdomloong-console-bootstrap"
install -d -m 755 "$acme_root/.well-known/acme-challenge"
cat >"$bootstrap_site" <<'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name console.wisdomloong.com;

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }

    location / {
        return 404;
    }
}
EOF

nginx -t
systemctl reload nginx
certbot certonly --webroot --webroot-path "$acme_root" \
  --non-interactive --agree-tos --register-unsafely-without-email \
  --keep-until-expiring -d console.wisdomloong.com

echo "Private SSH proxy account and console tunnel endpoint are ready."
