#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Config directory is one level up from src/
CONFIG_DIR="$(dirname "$SCRIPT_DIR")/config"
ENV_FILE="$CONFIG_DIR/.env"

# Function to check and prompt for environment variables
check_and_prompt_env_var() {
    local var_name=$1
    local var_value=${!var_name}

    if [ -z "$var_value" ]; then
        read -p "Enter your $var_name: " var_value
        echo "$var_name=$var_value" >> "$ENV_FILE"
    fi
}

# Ensure config directory exists
mkdir -p "$CONFIG_DIR"

# Check if .env file exists, create if it doesn't
if [ ! -f "$ENV_FILE" ]; then
    echo ".env file not found. Creating .env file at $ENV_FILE..."
    touch "$ENV_FILE"
fi

# Load existing environment variables from .env
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Check and prompt for each required variable
check_and_prompt_env_var "AUTHORIZATION_TOKEN"
check_and_prompt_env_var "USER_DISCORD_ID"
check_and_prompt_env_var "DATA_PACKAGE_FOLDER"
check_and_prompt_env_var "EXPORT_PATH"
check_and_prompt_env_var "DCE_PATH"

# Reload environment variables after potentially adding new ones
export $(grep -v '^#' "$ENV_FILE" | xargs)

# Function to export the channel in the specified format
export_channel() {
    local FORMAT=$1
    echo "Exporting direct messages in ${FORMAT} format..."
    "$DCE_PATH"/DiscordChatExporter.Cli exportdm -t "$AUTHORIZATION_TOKEN" -o "${EXPORT_PATH}/%G/%c/%C - %d/" \
    --partition 10MB --format "$FORMAT" --media-dir "${EXPORT_PATH}/media" --media --reuse-media --parallel 4
}

# Main script execution
export_channel Json
export_channel HtmlDark
