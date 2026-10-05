#!/bin/bash
#
# swap.sh - Swap between different landscape-specific config and .env configurations
#
# Purpose:
#   This script allows switching the active config.json and .env files between different landscapes
#   (dev, test, staging, prod, etc.) while preserving the current state of each landscape.
#
# How it works:
#   1. Reads landscape from the current config.json to determine the active landscape
#   2. Saves the current config.json to config/config.<current_landscape>.json (preserving current state)
#   3. Saves the current .env to config/<current_landscape>.env (preserving current state)
#   4. Loads config/config.<target_landscape>.json into config.json (activating target landscape)
#   5. Loads config/<target_landscape>.env into .env (activating target landscape)
#
# Non-destructive:
#   - No config file content is ever lost
#   - Each landscape's state is preserved in its landscape-specific backup files
#   - The active config.json and .env are always saved before switching
#
# Usage:
#   ./swap.sh <landscape>
#
# Examples:
#   ./swap.sh staging   # Switch to staging landscape
#   ./swap.sh dev       # Switch back to dev landscape
#   ./swap.sh prod      # Switch to prod landscape
#
# Prerequisites:
#   - jq must be installed for JSON parsing
#   - Target landscape file (config.<landscape>.json) must exist in config/ directory
#   - Target .env file (<landscape>.env) should exist in config/ directory
#   - config.json must have top-level landscape field
#   - .env file should have LANDSCAPE variable matching the landscape
#
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Check for landscape parameter
if [ -z "$1" ]; then
    echo -e "${RED}Error: Landscape parameter required${NC}"
    echo "Usage: ./swap.sh <landscape>"
    echo "Example: ./swap.sh staging"
    exit 1
fi

TARGET_LANDSCAPE="$1"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config.json"
ENV_FILE="$ROOT_DIR/.env"

# Check if config.json exists in config directory
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: config.json not found at $SCRIPT_DIR${NC}"
    exit 1
fi

# 2. Check current landscape in config.json
CURRENT_LANDSCAPE=$(jq -r '.landscape' "$CONFIG_FILE" 2>/dev/null)

if [ $? -ne 0 ] || [ "$CURRENT_LANDSCAPE" = "null" ] || [ -z "$CURRENT_LANDSCAPE" ]; then
    echo -e "${RED}Error: Could not read landscape from config.json${NC}"
    echo "Note: config.json must have a top-level 'landscape' field"
    echo "Example: { \"landscape\": \"dev\", ... }"
    exit 1
fi

# Check if .env file exists and read its LANDSCAPE variable
CURRENT_ENV_LANDSCAPE=""
if [ -f "$ENV_FILE" ]; then
    CURRENT_ENV_LANDSCAPE=$(grep -E "^LANDSCAPE=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
fi

# Validate .env LANDSCAPE variable and check for mismatch
if [ -f "$ENV_FILE" ]; then
    if [ -z "$CURRENT_ENV_LANDSCAPE" ]; then
        echo -e "${YELLOW}Warning: .env file exists but has no LANDSCAPE variable${NC}"
        echo "Will use config.json landscape ($CURRENT_LANDSCAPE) as fallback for .env backup."
        echo ""
        CURRENT_ENV_LANDSCAPE="$CURRENT_LANDSCAPE"  # Fallback to config.json landscape
    elif [ "$CURRENT_ENV_LANDSCAPE" != "$CURRENT_LANDSCAPE" ]; then
        echo -e "${YELLOW}Warning: Landscape mismatch detected${NC}"
        echo "  config.json landscape: $CURRENT_LANDSCAPE"
        echo "  .env LANDSCAPE: $CURRENT_ENV_LANDSCAPE"
        echo "  → .env will be saved to config/$CURRENT_ENV_LANDSCAPE.env (preserving $CURRENT_ENV_LANDSCAPE state)"
        echo "  → config.json will be saved to config/config.$CURRENT_LANDSCAPE.json (preserving $CURRENT_LANDSCAPE state)"
        echo ""
    fi
fi

# Only exit early if BOTH config.json and .env are already at target landscape
if [ "$CURRENT_LANDSCAPE" = "$TARGET_LANDSCAPE" ]; then
    if [ -z "$CURRENT_ENV_LANDSCAPE" ] || [ "$CURRENT_ENV_LANDSCAPE" = "$TARGET_LANDSCAPE" ]; then
        echo -e "${YELLOW}Already at landscape: $TARGET_LANDSCAPE${NC}"
        echo "No swap needed."
        exit 0
    else
        echo -e "${YELLOW}Note: config.json is already at $TARGET_LANDSCAPE, but .env has LANDSCAPE=$CURRENT_ENV_LANDSCAPE${NC}"
        echo "Will swap .env file only."
        echo ""
    fi
fi

# 3. Check if target config file exists
TARGET_CONFIG_FILE="$SCRIPT_DIR/config.$TARGET_LANDSCAPE.json"
if [ ! -f "$TARGET_CONFIG_FILE" ]; then
    echo -e "${RED}Error: Target file not found: config/config.$TARGET_LANDSCAPE.json${NC}"
    echo "Available config files:"
    ls -1 "$SCRIPT_DIR"/config.*.json 2>/dev/null || echo "  (none)"
    exit 1
fi

# Check if target .env file exists (warning only, not fatal)
TARGET_ENV_FILE="$SCRIPT_DIR/$TARGET_LANDSCAPE.env"
if [ ! -f "$TARGET_ENV_FILE" ]; then
    echo -e "${YELLOW}Warning: Target .env file not found: config/$TARGET_LANDSCAPE.env${NC}"
    echo "Only config.json will be swapped. .env file will remain unchanged."
    echo ""
fi

# 4. Perform the swap
BACKUP_CONFIG_FILE="$SCRIPT_DIR/config.$CURRENT_LANDSCAPE.json"
# Use .env's LANDSCAPE variable (not config.json) to determine where to save .env backup
BACKUP_ENV_FILE="$SCRIPT_DIR/$CURRENT_ENV_LANDSCAPE.env"

echo -e "${GREEN}Swapping landscape from $CURRENT_LANDSCAPE to $TARGET_LANDSCAPE${NC}"
echo ""

# Save current config.json to config/config.<current_landscape>.json (overwrite is correct behavior)
echo "Saving current config.json → config/config.$CURRENT_LANDSCAPE.json"
cp "$CONFIG_FILE" "$BACKUP_CONFIG_FILE"

# Save current .env to config/<current_env_landscape>.env if it exists
if [ -f "$ENV_FILE" ]; then
    echo "Saving current .env → config/$CURRENT_ENV_LANDSCAPE.env"
    cp "$ENV_FILE" "$BACKUP_ENV_FILE"
else
    echo -e "${YELLOW}Note: .env file not found at root, skipping .env backup${NC}"
fi

# Copy target config file to config.json
echo "Loading config/config.$TARGET_LANDSCAPE.json → config.json"
cp "$TARGET_CONFIG_FILE" "$CONFIG_FILE"

# Copy target .env file to .env if it exists
if [ -f "$TARGET_ENV_FILE" ]; then
    echo "Loading config/$TARGET_LANDSCAPE.env → .env"
    cp "$TARGET_ENV_FILE" "$ENV_FILE"
    
    # Validate that loaded .env contains expected LANDSCAPE variable
    LOADED_ENV_LANDSCAPE=$(grep -E "^LANDSCAPE=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ -z "$LOADED_ENV_LANDSCAPE" ]; then
        echo -e "${YELLOW}Warning: Loaded .env file has no LANDSCAPE variable${NC}"
    elif [ "$LOADED_ENV_LANDSCAPE" != "$TARGET_LANDSCAPE" ]; then
        echo -e "${YELLOW}Warning: Loaded .env has LANDSCAPE=$LOADED_ENV_LANDSCAPE but expected $TARGET_LANDSCAPE${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✓ Successfully swapped landscape to: $TARGET_LANDSCAPE${NC}"
echo ""
echo "Files swapped:"
echo "  - config.json (now $TARGET_LANDSCAPE)"
if [ -f "$ENV_FILE" ]; then
    echo "  - .env (now $TARGET_LANDSCAPE with LANDSCAPE=$TARGET_LANDSCAPE)"
fi
echo ""
echo "Files preserved:"
echo "  - config/config.$CURRENT_LANDSCAPE.json (saved current state)"
if [ -f "$BACKUP_ENV_FILE" ]; then
    echo "  - config/$CURRENT_ENV_LANDSCAPE.env (saved current state)"
fi
echo "  - config/config.$TARGET_LANDSCAPE.json (preserved)"
if [ -f "$TARGET_ENV_FILE" ]; then
    echo "  - config/$TARGET_LANDSCAPE.env (preserved)"
fi
