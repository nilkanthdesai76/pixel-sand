#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
PORT=4500

# Terminate any old process holding the port
lsof -ti :$PORT | xargs kill -9 2>/dev/null || true
sleep 0.2

echo "🧪 Starting PixelSand 60 FPS Physics Sandbox on http://127.0.0.1:$PORT ..."
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!

trap "kill -9 $SERVER_PID 2>/dev/null; exit 0" SIGINT SIGTERM EXIT

sleep 0.6
open "http://127.0.0.1:$PORT"
echo "PixelSand is live. Press Ctrl+C to stop."
wait $SERVER_PID
