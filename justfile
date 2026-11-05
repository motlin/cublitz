# `just --list --unsorted`
[group('default')]
default:
    @just --list --unsorted

ci := env("CI", "")

export PATH := justfile_directory() / "node_modules/.bin" + ":" + env("PATH")

# Install dependencies
[group('setup')]
install:
    pnpm install

# Run dev server
dev *args: install
    vp dev {{ args }}

# Run linter
lint: install
    vp lint {{ if ci != "" { "--format github" } else { "--fix" } }}

# Run formatter
format: install
    pre-commit run just-fmt --all-files
    oxfmt-next-line {{ if ci != "" { "--check" } else { "" } }}

# Run checks (lint + typecheck; formatting is `just format`)
check *args: install
    vp run --cache check {{ if ci != "" { "" } else { "--fix" } }} {{ args }}

# Run tests
test *args: install
    vp run --cache test:run {{ args }}

# Run the unit tests and report coverage of the core modules
coverage: install
    node node_modules/vitest/dist/cli.js run --coverage

# Type-check the project
typecheck: install
    vp run typecheck

# Build the project
build: install
    vp run --cache build

# Run the Playwright browser tests against a fresh build
test-browser *args: build
    pnpm exec playwright test {{ args }}

# Render the app icons in public/icons/ from scripts/icons/ (needs rsvg-convert)
icons:
    rsvg-convert -w 192 -h 192 scripts/icons/icon.svg -o public/icons/icon-192.png
    rsvg-convert -w 512 -h 512 scripts/icons/icon.svg -o public/icons/icon-512.png
    rsvg-convert -w 512 -h 512 scripts/icons/icon-maskable.svg -o public/icons/icon-maskable-512.png
    rsvg-convert -w 180 -h 180 scripts/icons/icon-maskable.svg -o public/icons/apple-touch-icon.png

# Render the link preview image public/og.png from scripts/og-image.ts (needs the network for Google Fonts)
og-image: install
    node scripts/og-image.ts

# Upload dist/ to the production Cloudflare Pages deployment
deploy: build
    pnpm run deploy

# Apply safe Fallow fixes locally, then reject remaining dead code
fallow: install
    {{ if ci == "" { "vp run fallow" } else { "true" } }}
    vp run fallow:ci

# vp run fallow:ci
fallow-check: install
    vp run fallow:ci

# Run pre-commit hooks on all files (same as CI's pre-commit job)
pre-commit: install
    pre-commit run --all-files

# Run all pre-commit checks
[arg("quick", long, value="true", help="Skip tests")]
verify quick="": check build fallow pre-commit
    {{ if quick != "true" { "just test && just test-browser" } else { "true" } }}
    @echo "All pre-commit checks passed!"

# Deprecated alias for `verify`
[arg("quick", long, value="true", help="Skip tests")]
precommit quick="": (verify quick)
