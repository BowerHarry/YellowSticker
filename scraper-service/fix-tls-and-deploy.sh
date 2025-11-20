#!/bin/bash
# Fix TLS error and deploy enhanced Undetected Chrome

set -e

echo "========================================="
echo "Fixing TLS Error & Deploying Updates"
echo "========================================="
echo ""

# Step 1: Start Tailscale Funnel
echo "Step 1: Starting Tailscale Funnel..."
echo ""
# Use HTTP (service runs on HTTP, Tailscale will provide HTTPS)
FUNNEL_OUTPUT=$(tailscale funnel 3000 2>&1)
echo "$FUNNEL_OUTPUT"
echo ""

# Extract Funnel URL from output (look for https:// URLs)
FUNNEL_URL=$(echo "$FUNNEL_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.ts\.net' | head -1)

if [ -z "$FUNNEL_URL" ]; then
    echo "⚠️  Warning: Could not extract Funnel URL from output"
    echo "Please run manually: tailscale funnel --https=3000"
    echo "Then copy the URL and update Supabase secret"
else
    echo "✅ Tailscale Funnel URL: $FUNNEL_URL"
    echo ""
    echo "📝 Next step: Update Supabase secret with this URL:"
    echo "   supabase secrets set SELF_HOSTED_SCRAPER_URL=\"$FUNNEL_URL\""
    echo ""
fi

# Step 2: Rebuild container with new code
echo "Step 2: Rebuilding Docker container with enhanced Undetected Chrome..."
echo ""
cd ~/YellowSticker/scraper-service
docker compose -f docker-compose.arm.yml build
echo ""

# Step 3: Restart container
echo "Step 3: Restarting container..."
echo ""
docker compose -f docker-compose.arm.yml restart
echo ""

# Step 4: Wait for service to be ready
echo "Step 4: Waiting for service to be ready..."
sleep 5

# Step 5: Test service
echo "Step 5: Testing service..."
echo ""
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
if [ "$HEALTH_RESPONSE" == '{"status":"ok","service":"yellow-sticker-scraper"}' ]; then
    echo "✅ Service is healthy!"
else
    echo "⚠️  Service health check returned: $HEALTH_RESPONSE"
fi
echo ""

# Step 6: Check logs
echo "Step 6: Recent container logs..."
echo ""
docker compose -f docker-compose.arm.yml logs --tail=10
echo ""

echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "✅ Tailscale Funnel: $FUNNEL_URL"
echo "✅ Container: Rebuilt and restarted"
echo "✅ Service: Running on port 3000"
echo ""
echo "📝 Don't forget to update Supabase:"
echo "   supabase secrets set SELF_HOSTED_SCRAPER_URL=\"$FUNNEL_URL\""
echo ""
echo "🧪 Test from your Mac:"
echo "   curl https://$FUNNEL_URL/health"
echo ""

