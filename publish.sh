#!/usr/bin/env sh
# Explicit release command; never called by compilation, testing, or packaging.
set -eu
npm run lint
npm test
npm run test:integration
npx --no-install vsce publish "$@"
