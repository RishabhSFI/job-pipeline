#!/bin/bash
# scripts/install-mac.sh
# Sets up Job Pipeline on a Mac:
#   - installs dependencies
#   - creates .env.local, config/applyKit.json and credentials/ if missing
#   - starts the dashboard at login (http://localhost:$PORT)
#   - runs the job search every $HOURS_BETWEEN_RUNS hours, and at login
# Safe to run again: it replaces its own background jobs and never
# overwrites your settings. The digest email time is DIGEST_HOUR in .env.local.
#
#   ./scripts/install-mac.sh                 # dashboard on 3001, search every 4 hours
#   PORT=3002 HOURS_BETWEEN_RUNS=6 ./scripts/install-mac.sh
#   JOBPIPELINE_SKIP_AGENTS=1 ...   files only, no background jobs (used by tests)

set -euo pipefail

PORT="${PORT:-3001}"
HOURS_BETWEEN_RUNS="${HOURS_BETWEEN_RUNS:-4}"
case "$HOURS_BETWEEN_RUNS" in
  '' | *[!0-9]* | 0) echo "HOURS_BETWEEN_RUNS must be a whole number of hours, 1 or more."; exit 1 ;;
esac
DIR="$(cd "$(dirname "$0")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
UID_NUM="$(id -u)"

say() { printf '\n== %s\n' "$1"; }

case "$DIR" in
  "$HOME/Desktop"* | "$HOME/Documents"* | "$HOME/Downloads"*)
    echo "This folder is inside Desktop, Documents or Downloads: $DIR"
    echo "macOS blocks background jobs from reading those folders, so the"
    echo "scheduled search would fail. Move the folder (for example to ~/Projects)"
    echo "and run this script again."
    exit 1
    ;;
esac

NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  echo "Node.js is not installed. Install it from https://nodejs.org (LTS), then run this again."
  exit 1
fi
NODE_MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or newer is needed (you have $("$NODE" -v)). Update it from https://nodejs.org."
  exit 1
fi
NODE_BIN="$(dirname "$NODE")"

cd "$DIR"

say "Installing dependencies"
npm ci --no-audit --no-fund

say "Creating your private files (existing ones are kept)"
mkdir -p credentials logs resumes
[ -f .env.local ] || {
  cp .env.local.example .env.local
  sed -i '' "s|^GOOGLE_SERVICE_ACCOUNT_KEY_PATH=.*|GOOGLE_SERVICE_ACCOUNT_KEY_PATH=$DIR/credentials/keys.json|" .env.local
  sed -i '' "s|^CRON_SECRET=.*|CRON_SECRET=$(openssl rand -hex 24)|" .env.local
  echo "Created .env.local"
}
if grep -q '^DASHBOARD_PORT=' .env.local; then
  sed -i '' "s|^DASHBOARD_PORT=.*|DASHBOARD_PORT=$PORT|" .env.local
else
  printf '\n# Set by the installer: where the dashboard runs\nDASHBOARD_PORT=%s\n' "$PORT" >> .env.local
fi
[ -f config/applyKit.json ] || {
  cp config/applyKit.example.json config/applyKit.json
  echo "Created config/applyKit.json"
}

if [ -n "${JOBPIPELINE_SKIP_AGENTS:-}" ]; then
  say "Done (background jobs skipped)"
  exit 0
fi

say "Starting the dashboard at login (port $PORT)"
cat > "$AGENTS/com.jobpipeline.dashboard.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jobpipeline.dashboard</string>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN/npm</string><string>run</string><string>dev</string>
    <string>--</string><string>-p</string><string>$PORT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_BIN:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$DIR/logs/dashboard.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/dashboard.log</string>
</dict>
</plist>
EOF

# StartInterval: a run missed while the Mac sleeps happens when it wakes.
# RunAtLoad: a Mac that was shut down searches again at login.
say "Scheduling the job search every $HOURS_BETWEEN_RUNS hours"
cat > "$AGENTS/com.jobpipeline.daily.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jobpipeline.daily</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$DIR/run-daily.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$NODE_BIN:/usr/bin:/bin</string></dict>
  <key>StartInterval</key><integer>$((HOURS_BETWEEN_RUNS * 3600))</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>$DIR/logs/launchd.err</string>
</dict>
</plist>
EOF

for job in dashboard daily; do
  launchctl bootout "gui/$UID_NUM/com.jobpipeline.$job" 2>/dev/null || true
  # bootout returns before the old job has fully stopped; wait for it.
  for _ in $(seq 1 20); do
    launchctl print "gui/$UID_NUM/com.jobpipeline.$job" >/dev/null 2>&1 || break
    sleep 0.5
  done
  launchctl bootstrap "gui/$UID_NUM" "$AGENTS/com.jobpipeline.$job.plist"
done

say "Done"
echo "Dashboard:   http://localhost:$PORT  (give it ~20 seconds to start)"
echo "Job search:  every $HOURS_BETWEEN_RUNS hours and at login, log in logs/run.log"
echo
echo "Next, run:  npm run setup"
echo "It walks you through connecting Google, adding your resume and your first search."
