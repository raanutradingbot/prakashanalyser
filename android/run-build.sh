#!/bin/bash
set -e
PASS_FILE="/c/Users/Archana Arjunraj/Documents/PrakashAnalyser-signing/keystore-password.txt"
if [ ! -f "$PASS_FILE" ]; then
  echo "Password file not found: $PASS_FILE" >&2
  exit 1
fi
PASS=$(cat "$PASS_FILE")
export BUBBLEWRAP_KEYSTORE_PASSWORD="$PASS"
export BUBBLEWRAP_KEY_PASSWORD="$PASS"
export JAVA_HOME="C:\PROGRA~1\MIE74D~1\jdk-17.0.21.21-hotspot"
unset PASS
cd "$(dirname "$0")"
node build.cjs
