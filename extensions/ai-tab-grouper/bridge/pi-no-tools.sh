#!/bin/sh
exec "${PI_BINARY:-pi}" --no-tools --no-extensions --no-skills --no-prompt-templates --no-context-files --no-mcp "$@"
