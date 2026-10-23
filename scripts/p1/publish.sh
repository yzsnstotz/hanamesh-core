#!/usr/bin/env bash
set -euo pipefail
# Retired unchecked historical tar publisher. The normal guard names the refusal.
cd "$(dirname "$0")/../.."
exec npm run prepublishOnly
