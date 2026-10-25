#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -c 'import runpy; runpy.run_path("scripts/build-hub.py", run_name="__main__")'
