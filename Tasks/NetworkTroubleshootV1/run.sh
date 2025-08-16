#!/bin/bash

echo "Running Network Troubleshoot task (Bash wrapper)"
NODE_DIR="$(dirname "$0")"
if [ -f "$NODE_DIR/index.js" ]; then
  node "$NODE_DIR/index.js"
else
  echo "Node runner not found: $NODE_DIR/index.js" >&2
  exit 1
fi
