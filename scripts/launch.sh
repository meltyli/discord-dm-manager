#!/bin/bash
# Launch DiscorDManager in interactive mode

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If the Docker image doesn't exist, run the rebuild script so Discord Chat Exporter is included
if [ -z "$(docker images -q discordmanager:latest 2>/dev/null)" ]; then
	echo "Docker image 'discordmanager:latest' not found. Running rebuild.sh to build image..."
	"$SCRIPT_DIR/rebuild.sh"
fi

# Set user/group IDs for proper permissions
# Note: UID is readonly in bash/zsh, so we use USER_UID instead
export USER_UID=$(id -u)
export USER_GID=$(id -g)

docker compose run --rm discordmanager interactive
