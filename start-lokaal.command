#!/bin/bash
# Familiequiz starten op deze Mac/Linux-computer (ook zonder internet). Dubbelklik dit bestand.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js is niet geïnstalleerd. Installeer het eerst via nodejs.org."; read -r; exit 1; }
[ -d node_modules/express ] || { echo 'Eerst één keer "npm install" draaien terwijl je internet hebt.'; read -r; exit 1; }
node scripts/offline-check.js
( sleep 2; (open "http://127.0.0.1:3000/bediening.html" 2>/dev/null || xdg-open "http://127.0.0.1:3000/bediening.html" 2>/dev/null) ) &
node scripts/run.js
