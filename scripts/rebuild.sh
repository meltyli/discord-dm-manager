#!/bin/bash
# Rebuild DiscorDManager from scratch

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Cleaning up Docker containers and images..."

# Stop any running Docker Compose build processes
pkill -f "docker compose build" 2>/dev/null || true

# Run clean script to stop containers and remove image
"$SCRIPT_DIR/clean.sh"

echo "Building fresh Docker image..."
docker compose build --no-cache

echo "Rebuild complete!"
echo ""
echo "Testing build..."
docker compose run --rm discordmanager --help

echo ""
echo "To launch the application, run:"
echo "  ./scripts/launch.sh"
