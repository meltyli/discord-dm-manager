#!/bin/bash
# Rebuild Discord DM Manager from scratch

set -e

echo "🧹 Cleaning up Docker containers and images..."

# Remove containers
docker-compose down 2>/dev/null || true

# Remove image
docker rmi discord-dm-manager:latest 2>/dev/null || true

echo "🔨 Building fresh Docker image..."
docker-compose build --no-cache

echo "✅ Rebuild complete!"
echo ""
echo "🧪 Testing build..."
docker-compose run --rm discord-dm-manager --help

echo ""
echo "To launch the application, run:"
echo "  ./scripts/launch.sh"
