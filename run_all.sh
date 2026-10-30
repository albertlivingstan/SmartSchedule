#!/usr/bin/env bash
# ==============================================================================
# SmartSchedule AI 3.0 — Master Full Project Runner
# Runs Backend API, Built UI, Background Reminder Worker, and Public HTTPS Tunnel
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "   SmartSchedule AI 3.0 — Starting Full Stack System"
echo "=========================================================="

# 1. Determine Python binary
if [ -x "/opt/miniconda3/bin/python" ]; then
    PYTHON_BIN="/opt/miniconda3/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON_BIN="python3"
else
    PYTHON_BIN="python"
fi

# 2. Free port 8000 if previously occupied
lsof -ti :8000 | xargs kill -9 2>/dev/null || true

# 3. Start Backend Server (Serves API, Swagger, and React UI)
echo "[1/3] Starting FastAPI Server on port 8000..."
$PYTHON_BIN -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

sleep 2

# 4. Start Background Reminder Worker
echo "[2/3] Starting Background Reminder & Outbox Worker..."
$PYTHON_BIN -m app.services.outbox_worker --loop &
WORKER_PID=$!

# 5. Trap Exit Signals to cleanly shutdown all background processes
cleanup() {
    echo ""
    echo "=========================================================="
    echo "Shutting down SmartSchedule services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $WORKER_PID 2>/dev/null || true
    echo "All services stopped."
    echo "=========================================================="
    exit 0
}
trap cleanup SIGINT SIGTERM

echo "=========================================================="
echo "🚀 SMART SCHEDULE SYSTEM IS ONLINE!"
echo "   • Local Web Dashboard:  http://127.0.0.1:8000"
echo "   • Swagger API Docs:     http://127.0.0.1:8000/docs"
echo "   • Database:             PostgreSQL (localhost:5432)"
echo "   • Background Worker:    Active (monitoring reminders)"
echo "=========================================================="
echo "[3/3] Opening Live HTTPS Tunnel for UiPath Studio Web..."
echo "(Press Ctrl+C at any time to stop all services cleanly)"
echo "----------------------------------------------------------"

# 6. Start Public HTTPS Tunnel
ssh -T -o StrictHostKeyChecking=no -p 443 -R0:localhost:8000 a.pinggy.io
