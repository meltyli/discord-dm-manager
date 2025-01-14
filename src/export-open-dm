#!/bin/bash

# Function to retrieve or prompt for the Discord token
get_token() {
    if [ -f "token.txt" ]; then
        echo "Reading token from token.txt..."
        TOKEN=$(<token.txt)
    else
        read -p "Enter your Discord token: " TOKEN
        echo "$TOKEN" > token.txt
    fi
}

# Function to retrieve or prompt for the output path
get_output_path() {
    if [ -f "outputPath.txt" ]; then
        echo "Reading output path from outputPath.txt..."
        OUTPUT_PATH=$(<outputPath.txt)
    else
        read -p "Enter the desired output path: " OUTPUT_PATH
        echo "$OUTPUT_PATH" > outputPath.txt
    fi
}

# Function to retrieve or prompt for the DCE path
get_dce_path() {
    if [ -f "DCEPath.txt" ]; then
        echo "Reading DCE path from DCEPath.txt..."
        DCE_PATH=$(<DCEPath.txt)
    else
        read -p "Enter the DiscordChatExporter path: " DCE_PATH
        echo "$DCE_PATH" > DCEPath.txt
    fi
}

# Function to export the channel in the specified format
export_channel() {
    local FORMAT=$1
    echo "Exporting direct messages in ${FORMAT} format..."
    "$DCE_PATH"/DiscordChatExporter.Cli exportdm -t "$TOKEN" -o "${OUTPUT_PATH}/%G/%c/%C - %d/" \
    --partition 10MB --format "$FORMAT" --media-dir "media" --media --reuse-media --parallel 4
}

# Main script execution
get_token
get_output_path
get_dce_path
export_channel Json
export_channel HtmlDark
