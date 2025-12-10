#!/bin/bash
# 08-12-25: Add extensive logging for debugging container exits
# 08-12-25: Make PulseAudio optional and non-fatal
# 07-12-25: Created entrypoint script for video recording container
# Phase 5: Video Recording Container Entrypoint

# Don't exit on error - we want to log everything
set +e

log() {
    echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"
}

log "=== Video Recording Container Starting ==="
log "Project ID: ${PROJECT_ID}"
log "Tenant ID: ${TENANT_ID}"
log "S3 Bucket: ${S3_BUCKET}"
log "USE_SIMPLE_RECORDING: ${USE_SIMPLE_RECORDING:-not set}"
log "ENABLE_AUDIO_PLAYBACK: ${ENABLE_AUDIO_PLAYBACK:-not set}"
log "AWS_REGION: ${AWS_REGION:-not set}"

# Log system info
log "=== System Info ==="
log "Memory info:"
free -h 2>/dev/null || log "free command not available"
log "Disk space:"
df -h /tmp 2>/dev/null || log "df command not available"
log "CPU info:"
nproc 2>/dev/null || log "nproc not available"

# Check if required binaries exist
log "=== Checking Required Binaries ==="
for bin in node chromium ffmpeg; do
    if command -v $bin &> /dev/null; then
        log "$bin: $(which $bin)"
    else
        log "WARNING: $bin not found in PATH"
    fi
done

# Start virtual display (non-fatal if unavailable for headless runs)
log "Starting Xvfb..."
Xvfb :99 -screen 0 1920x1080x24 >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!
sleep 2
if kill -0 "${XVFB_PID}" 2>/dev/null; then
    export DISPLAY=:99
    log "Xvfb started successfully (PID: ${XVFB_PID})"
else
    log "WARNING: Xvfb failed to stay up"
    log "Xvfb log contents:"
    cat /tmp/xvfb.log 2>/dev/null || log "No xvfb log available"
fi

# Start PulseAudio daemon only when audio playback is enabled
if [ "${ENABLE_AUDIO_PLAYBACK}" = "true" ]; then
    log "Starting PulseAudio..."
    pulseaudio --start --log-target=syslog 2>&1 && log "PulseAudio started" || log "WARNING: PulseAudio failed to start"
    sleep 1
else
    log "Skipping PulseAudio (audio playback disabled)"
fi

# Verify display is working only when not using simple/headless mode
if [ "${USE_SIMPLE_RECORDING}" != "true" ]; then
    log "Verifying display..."
    if xdpyinfo -display :99 >/dev/null 2>&1; then
        log "Display :99 is available"
    else
        log "WARNING: Display :99 is not available (continuing anyway for debugging)"
    fi
else
    log "Skipping display verification for simple recording"
fi

# Create required directories
log "Creating directories..."
mkdir -p /tmp/audio /tmp/video /tmp/script
log "Directories created"

log "=== Environment Ready ==="

# Run the Node.js video recording application
log "Starting video recorder (node /app/dist/index.js)..."
node /app/dist/index.js
EXIT_CODE=$?

log "Node process exited with code: ${EXIT_CODE}"

# List any files created
log "=== Files in /tmp/video ==="
ls -la /tmp/video 2>/dev/null || log "No files in /tmp/video"

log "=== Container Exiting ==="
exit ${EXIT_CODE}
