#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")/.."
"build/Cyan Grove.app/Contents/MacOS/Cyan Grove" --self-test
codesign --verify --deep --strict 'build/Cyan Grove.app'
