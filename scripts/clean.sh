#!/bin/bash
# Remove DiscorDManager containers and images

set -e

echo "Stopping and removing containers..."
docker compose down 2>/dev/null || true

echo "Removing DiscorDManager image..."
docker rmi discordmanager:latest 2>/dev/null || true

echo ""
echo "Cleanup complete!"
