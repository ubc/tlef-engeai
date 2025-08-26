#!/bin/bash

# Configuration
QDRANT_HOST="localhost"
QDRANT_PORT="6340"
TEST_FILE="src/test/file-test/chemistry-concepts.txt"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "Starting Qdrant upload test..."

# Check if the test file exists
if [ ! -f "$TEST_FILE" ]; then
    echo -e "${RED}Error: Test file not found at $TEST_FILE${NC}"
    exit 1
fi

# Read the file content
echo "Reading test file..."
CONTENT=$(cat "$TEST_FILE")

# Prepare the JSON payload
# Note: We need to escape the content properly for JSON
ESCAPED_CONTENT=$(echo "$CONTENT" | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
JSON_PAYLOAD="{\"content\":\"$ESCAPED_CONTENT\",\"metadata\":{\"timestamp\":\"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",\"source\":\"chemistry-test\"}}"

# Make the API call
echo "Uploading to Qdrant..."
RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$JSON_PAYLOAD" \
    "http://$QDRANT_HOST:$QDRANT_PORT/api/documents")

# Extract the HTTP status code
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$RESPONSE" | sed \$d)

# Check if the upload was successful
if [ "$HTTP_CODE" -eq 200 ]; then
    echo -e "${GREEN}Success! Document uploaded to Qdrant${NC}"
    echo "Response:"
    echo "$RESPONSE_BODY" | python3 -m json.tool
else
    echo -e "${RED}Error: Failed to upload document${NC}"
    echo "Status code: $HTTP_CODE"
    echo "Response:"
    echo "$RESPONSE_BODY"
    exit 1
fi
