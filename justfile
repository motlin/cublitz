# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

# Install dependencies
[group('setup')]
install:
    pnpm install --frozen-lockfile

# Run dev server
dev *args: install
    pnpm exec vite {{ args }}

# Type-check and confirm the legacy artifact is untouched
check: install
    pnpm run typecheck
    node scripts/verify-legacy.ts

# Run the fast unit tests and golden checks
test *args: install
    pnpm exec vitest run {{ args }}

# Run the Playwright differential harness against a fresh build
test-browser *args: build
    pnpm exec playwright test {{ args }}

# Build the project into dist/
build: install
    pnpm run build

# Regenerate golden files from legacy/original.html
golden: install
    pnpm run golden

# Prove the harness catches mutated copies of dist/
prove-harness: build
    pnpm run prove-harness

# Upload dist/ to the production Cloudflare Pages deployment
deploy: build
    pnpm run deploy
