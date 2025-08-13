#!/bin/bash

# This script first compiles all TypeScript files and then starts the development server.

echo "--- Building TypeScript files... ---"
npm run build

echo ""
echo "--- Starting development server... ---"
npm run dev
