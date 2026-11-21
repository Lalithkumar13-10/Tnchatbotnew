#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/backend"
python -m pip install -q -r requirements.txt
python -m app.seed
echo ">> Citizen app : http://localhost:8000/app/citizen.html"
echo ">> Admin  app  : http://localhost:8000/app/admin.html"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
