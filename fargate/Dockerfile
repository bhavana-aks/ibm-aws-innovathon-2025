# 08-12-25: Updated Playwright base image to v1.49.0
# 07-12-25: Created Dockerfile for video recording container
# Phase 5: Video Recording Container with Playwright, FFmpeg, and Audio Support

FROM mcr.microsoft.com/playwright:v1.49.0-jammy

# Set environment variables
ENV NODE_ENV=production
ENV DISPLAY=:99
ENV AUDIO_PATH=/tmp/audio
ENV VIDEO_PATH=/tmp/video
ENV SCRIPT_PATH=/tmp/script

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install additional dependencies
# Using --no-install-recommends to reduce download size and build time
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone && \
    apt-get update && apt-get install -y --no-install-recommends \
    # FFmpeg for video/audio processing
    ffmpeg \
    # PulseAudio for audio playback during recording
    pulseaudio \
    pulseaudio-utils \
    # Virtual framebuffer for headless display
    xvfb \
    # AWS CLI for S3 access
    awscli \
    # Additional utilities
    curl \
    unzip \
    jq \
    # Clean up to reduce image size
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Create working directories and set ownership for pwuser
RUN mkdir -p /app ${AUDIO_PATH} ${VIDEO_PATH} ${SCRIPT_PATH} && \
    chown -R pwuser:pwuser ${AUDIO_PATH} ${VIDEO_PATH} ${SCRIPT_PATH}

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application source
COPY dist/ ./dist/

# Copy entrypoint script and fix Windows line endings
COPY entrypoint.sh /app/entrypoint.sh
RUN sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Set user (Playwright image comes with pwuser)
USER pwuser

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
