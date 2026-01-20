#!/bin/bash

# Quick start script for DiscorDManager CLI
# This script helps you run the CLI tool easily

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}DiscorDManager - CLI Mode${NC}\n"

# Check if config exists
if [ ! -f "config/config.json" ]; then
    echo -e "${YELLOW}Creating example config files...${NC}"
    cp config/config.json.example config/config.json
    echo -e "${GREEN}✓${NC} Created config/config.json"
fi

if [ ! -f "config/.env" ]; then
    cp config/.env.example config/.env
    echo -e "${GREEN}✓${NC} Created config/.env"
    echo -e "${RED}⚠ Please edit config/.env with your Discord token and user ID${NC}"
    exit 1
fi

# Run the CLI with passed arguments
if [ $# -eq 0 ]; then
    echo "Usage: ./run-cli.sh [options]"
    echo ""
    node src/cli/cli-runner.js --help
else
    node src/cli/cli-runner.js "$@"
fi
