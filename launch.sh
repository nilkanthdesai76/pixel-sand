#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"
PORT=4500
echo "🧪 Starting PixelSand 60 FPS Physics Sandbox on http://localhost:$PORT ..."
python3 -m http.server $PORT &
SERVER_PID=$!
sleep 0.8
open "http://localhost:$PORT"
echo "PixelSand is running. Press Ctrl+C to stop."
wait $SERVER_PID
