#!/usr/bin/env bash
# generate-self-signed-cert.sh — create a self-signed TLS certificate for local development.
# The certificate covers localhost and 127.0.0.1.
# Browser will show a security warning — this is expected for self-signed certificates.
# For production use a real certificate from Let's Encrypt or your CA.
set -euo pipefail

CERT_DIR="$(cd "$(dirname "$0")/.." && pwd)/nginx/certs"
mkdir -p "$CERT_DIR"

if ! command -v openssl &>/dev/null; then
  echo "[ERROR] openssl not found. Install openssl and re-run."
  exit 1
fi

if [[ -f "$CERT_DIR/cert.pem" ]]; then
  echo "[INFO] Certificate already exists at $CERT_DIR/cert.pem"
  echo "       Remove it manually if you want to regenerate."
  exit 0
fi

openssl req -x509 -nodes -days 825 \
  -newkey rsa:2048 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/C=XX/ST=DFIR/L=DFIR/O=DFIR-Collection-Kit/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

chmod 600 "$CERT_DIR/key.pem"
chmod 644 "$CERT_DIR/cert.pem"

echo ""
echo "[OK] Self-signed certificate generated:"
echo "     $CERT_DIR/cert.pem"
echo "     $CERT_DIR/key.pem"
echo ""
echo "[NOTE] To trust this certificate in your browser:"
echo "  Chrome/Edge: visit https://localhost, click 'Advanced' → 'Proceed'"
echo "  Firefox:     visit https://localhost, click 'Accept the Risk'"
echo "  macOS:       sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERT_DIR/cert.pem"
