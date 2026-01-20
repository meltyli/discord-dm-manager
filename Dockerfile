# Use Node.js LTS version
FROM node:18-alpine

# Install dependencies for .NET and DCE
RUN apk add --no-cache \
    bash \
    curl \
    unzip \
    icu-libs \
    krb5-libs \
    libgcc \
    libintl \
    libssl3 \
    libstdc++ \
    zlib

# Install .NET 8 runtime for Discord Chat Exporter (latest LTS)
RUN apk add --no-cache dotnet8-runtime

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use install when no lockfile is present)
RUN npm install --omit=dev --no-audit --no-fund

# Copy source code
COPY src/ ./src/

# Create necessary directories
RUN mkdir -p /app/config /app/export /app/logs

# Download Discord Chat Exporter
RUN mkdir -p /app/dce && \
    cd /app/dce && \
    curl -L -o DiscordChatExporter.Cli.zip \
    "https://github.com/Tyrrrz/DiscordChatExporter/releases/latest/download/DiscordChatExporter.Cli.linux-x64.zip" && \
    unzip DiscordChatExporter.Cli.zip && \
    rm DiscordChatExporter.Cli.zip && \
    chmod +x DiscordChatExporter.Cli

# Set environment variables for Docker mode
ENV DCE_PATH=/app/dce/DiscordChatExporter.Cli
ENV RUNNING_IN_DOCKER=true

# Create entrypoint script
RUN echo '#!/bin/bash' > /app/entrypoint.sh && \
    echo 'if [ "$1" = "interactive" ]; then' >> /app/entrypoint.sh && \
    echo '  exec node /app/src/cli/menu-main.js' >> /app/entrypoint.sh && \
    echo 'elif [ "$1" = "batch" ]; then' >> /app/entrypoint.sh && \
    echo '  exec node /app/src/batch/batch-entry.js' >> /app/entrypoint.sh && \
    echo 'else' >> /app/entrypoint.sh && \
    echo '  exec node /app/src/cli/cli-runner.js "$@"' >> /app/entrypoint.sh && \
    echo 'fi' >> /app/entrypoint.sh && \
    chmod +x /app/entrypoint.sh

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command shows help
CMD ["--help"]
