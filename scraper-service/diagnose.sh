#!/bin/bash
# Diagnostic script for Pi scraper service

echo "========================================="
echo "Pi Scraper Service Diagnostic"
echo "========================================="
echo ""

echo "1. Checking Docker container status..."
docker compose -f ~/YellowSticker/scraper-service/docker-compose.arm.yml ps
echo ""

echo "2. Checking recent container logs..."
docker compose -f ~/YellowSticker/scraper-service/docker-compose.arm.yml logs --tail=20
echo ""

echo "3. Testing local service..."
curl -s http://localhost:3000/health || echo "❌ Service not responding locally"
echo ""

echo "4. Checking Tailscale Funnel status..."
tailscale funnel status 2>/dev/null || echo "❌ Tailscale Funnel not running or not installed"
echo ""

echo "5. Checking if port 3000 is listening..."
sudo netstat -tulpn | grep 3000 || echo "❌ Port 3000 not listening"
echo ""

echo "6. Checking system resources..."
echo "Memory:"
free -h
echo ""
echo "Disk:"
df -h | grep -E '^/dev/'
echo ""

echo "7. Testing scrape endpoint (should fail with auth error, not TLS)..."
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' 2>&1 | head -5
echo ""

echo "========================================="
echo "Diagnostic complete!"
echo "========================================="

