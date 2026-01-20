#!/bin/bash
# Launch Discord DM Manager in interactive mode

set -e

# If the Docker image doesn't exist, run the rebuild script so Discord Chat Exporter is included
if [ -z "$(docker images -q discord-dm-manager:latest 2>/dev/null)" ]; then
	echo "Docker image 'discord-dm-manager:latest' not found. Running ./scripts/rebuild.sh to build image..."
	./scripts/rebuild.sh
fi

docker-compose run --rm discord-dm-manager interactive
