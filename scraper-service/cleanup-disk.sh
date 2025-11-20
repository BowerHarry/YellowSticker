#!/bin/bash
# Clean up disk space on Raspberry Pi

echo "========================================="
echo "Cleaning Up Disk Space"
echo "========================================="
echo ""

echo "Current disk usage:"
df -h
echo ""

echo "Step 1: Cleaning Docker..."
docker system prune -a --volumes -f
echo ""

echo "Step 2: Cleaning Docker build cache..."
docker builder prune -a -f
echo ""

echo "Step 3: Cleaning system packages..."
sudo apt autoremove -y
sudo apt autoclean
echo ""

echo "Step 4: Cleaning old logs (keeping last 7 days)..."
sudo journalctl --vacuum-time=7d 2>/dev/null || echo "Could not clean journal logs"
echo ""

echo "Step 5: Finding large files..."
echo "Top 10 largest directories:"
sudo du -h / 2>/dev/null | sort -rh | head -10
echo ""

echo "Final disk usage:"
df -h
echo ""

echo "========================================="
echo "Cleanup Complete!"
echo "========================================="
echo ""
echo "If you still need more space, check:"
echo "  - /var/log for old logs"
echo "  - ~/.cache for cache files"
echo "  - Old Docker images: docker images"
echo ""

