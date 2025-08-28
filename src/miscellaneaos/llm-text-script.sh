#!/bin/bash
# This script runs the ollama stream test.
# Make sure the backend server is running before executing this script.

echo "Running Ollama stream test..."
npx ts-node src/scripts/test-ollama-stream.ts
