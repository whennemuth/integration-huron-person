# Config Swap Utility

## Purpose

The `swap.sh` script allows switching between landscape-specific configurations (dev, test, staging, prod) while preserving the state of each landscape. It swaps both `config.json` and `.env` files simultaneously.

## Directory Structure

```
integration-huron-person/
├── config.json                      # Active configuration (root level)
├── .env                             # Active environment variables (root level)
└── config/
    ├── swap.sh                      # This swap script
    ├── README.md                    # This documentation
    ├── config.dev.json              # Dev landscape config
    ├── dev.env                      # Dev environment variables
    ├── config.staging.json          # Staging landscape config
    ├── staging.env                  # Staging environment variables
    ├── config.prod.json             # Production landscape config
    └── prod.env                     # Production environment variables
```

## Configuration Requirement

**IMPORTANT:** The `config.json` file must include a top-level `landscape` field to identify the current landscape:

```json
{
  "landscape": "dev",
  "executionMode": "person",
  "dataSource": {
    ...
  }
}
```

The `.env` file should have a corresponding `LANDSCAPE` variable:

```env
LANDSCAPE=dev
```

## Usage

### Switch to a different landscape:

```bash
cd config
./swap.sh staging
```

### Example workflow:

```bash
# Switch from dev to staging
./swap.sh staging

# Make changes to config.json while in staging...

# Switch to prod
./swap.sh prod

# Switch back to dev (your previous dev state is preserved)
./swap.sh dev
```

## How It Works

1. **Reads current landscape** from `config.json` (via top-level `landscape` field)
2. **Saves current state** to:
   - `config/config.<current_landscape>.json` (config backup)
   - `config/<current_landscape>.env` (environment variables backup)
3. **Loads target landscape** from:
   - `config/config.<target_landscape>.json` to root `config.json`
   - `config/<target_landscape>.env` to root `.env`
4. **Non-destructive** - all landscape states are preserved

**Note:** If a `.env` file doesn't exist for a landscape, only `config.json` will be swapped. The script will display a warning but continue successfully.

## Creating Landscape-Specific Configs

To create a new landscape configuration:

1. **Copy your current config.json:**
   ```bash
   cp ../config.json config.newlandscape.json
   ```

2. **Copy your current .env file:**
   ```bash
   cp ../.env newlandscape.env
   ```

3. **Edit both files:**
   - In `config.newlandscape.json`: Update top-level `landscape` field to `"newlandscape"`
   - In `config.newlandscape.json`: Modify landscape-specific values (URLs, bucket names, etc.)
   - In `newlandscape.env`: Update `LANDSCAPE=newlandscape` and other landscape-specific credentials

4. **Use the swap script:**
   ```bash
   ./swap.sh newlandscape
   ```

## Prerequisites

- **jq** must be installed for JSON parsing
  - Mac: `brew install jq`
  - Linux: `sudo apt-get install jq` or `sudo yum install jq`
  - Windows (Git Bash): Download from https://stedolan.github.io/jq/

## Troubleshooting

### Error: "Could not read landscape from config.json"

Your `config.json` is missing the top-level landscape field. Add it:

```json
{
  "landscape": "dev",
  "executionMode": "person",
  ...
}
```

### Error: "Target file not found"

The landscape-specific config file doesn't exist. Create it first:

```bash
cp ../config.json config.yourlandscape.json
# Edit config.yourlandscape.json to set top-level landscape field to "yourlandscape"
```

### Warning: "Target .env file not found"

The landscape-specific .env file doesn't exist. This is not fatal - only the config.json will be swapped. To add the .env file:

```bash
cp ../.env yourlandscape.env
# Edit yourlandscape.env to set LANDSCAPE=yourlandscape and other landscape-specific values
./swap.sh yourlandscape  # Swap again to include the .env file
```

### Landscape field doesn't match LANDSCAPE variable

If `config.json` has `"landscape": "dev"` but `.env` has `LANDSCAPE=staging`, use the swap script to sync them:

```bash
# The swap script ensures both files are from the same landscape
./swap.sh dev    # Loads both config.dev.json and dev.env
```
