#!/bin/bash
# scripts/uninstall-mac.sh
# Stops the dashboard and the daily run and removes their background jobs.
# Your files, settings and Google Sheet are left alone.

for job in dashboard daily; do
  launchctl bootout "gui/$(id -u)/com.jobpipeline.$job" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/com.jobpipeline.$job.plist"
done
echo "Background jobs removed. Delete the project folder too if you want it gone."
