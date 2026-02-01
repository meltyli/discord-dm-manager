#!/bin/bash
# Stop and remove DiscorDManager containers

set -e

echo "Stopping DiscorDManager containers..."
docker compose down

echo "DiscorDManager containers stopped and removed."
