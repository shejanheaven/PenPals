#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed yet."
  echo "Your browser will open the Node.js download page. Install the LTS version, then double-click this file again."
  open "https://nodejs.org/en/download"
  read -p "Press Enter to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First-time setup, this takes about a minute..."
  npm install
fi
echo "Starting Market Compass... keep this window open while you use the app."
(sleep 3; open "http://localhost:5173") &
npm run dev
