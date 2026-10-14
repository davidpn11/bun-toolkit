#!/usr/bin/env bash
# Installs a published btk release through the Homebrew tap, checks it, then opens a shell.
# Usage: btk-release-test [stable|beta] [-- command...]
set -euo pipefail

TAP="davidpn11/bun-toolkit"
TAP_URL="https://github.com/davidpn11/bun-toolkit"
ASSETS="/assets"
WORKSPACE="$HOME/workspace"

step() { printf '\n\033[1;35m==>\033[0m %s\n' "$*"; }
pass() { printf '\033[32m✔\033[0m %s\n' "$*"; }
fail() {
  printf '\033[31m✖\033[0m %s\n' "$*" >&2
  exit 1
}

formula_for() {
  case "$1" in
    stable) echo "bun-toolkit" ;;
    beta) echo "bun-toolkit-beta" ;;
    *) fail "Unknown channel \"$1\". Use stable or beta." ;;
  esac
}

install_release() {
  local formula="$1"
  step "Tapping $TAP"
  brew tap "$TAP" "$TAP_URL"
  if brew trust --help > /dev/null 2>&1; then
    brew trust --formula "$TAP/$formula"
  fi
  step "Installing $TAP/$formula"
  brew install "$TAP/$formula"
}

check_release() {
  local formula="$1" expected actual
  step "Checking the release"
  expected=$(brew list --versions "$formula" | awk '{ print $2 }')

  actual=$(btk --version)
  [ "$actual" = "$expected" ] || fail "btk --version printed $actual, the formula says $expected"
  pass "btk --version is $actual"

  actual=$(bun-toolkit --version)
  [ "$actual" = "$expected" ] || fail "bun-toolkit --version printed $actual, the formula says $expected"
  pass "bun-toolkit --version is $actual"

  brew test "$TAP/$formula" > /dev/null || fail "brew test $TAP/$formula failed"
  pass "brew test passes"

  local binary
  binary=$(readlink -f "$(command -v btk)")
  if command -v file > /dev/null; then
    pass "Running on $(uname -m): $(file -b "$binary" | cut -d, -f1-2)"
  else
    pass "Running on $(uname -m)"
  fi
}

# The mount is read-only; btk writes outputs next to its inputs, so work on a copy.
prepare_workspace() {
  mkdir -p "$WORKSPACE"
  if [ -d "$ASSETS" ]; then
    cp -R "$ASSETS/." "$WORKSPACE/"
    pass "Copied $(find "$WORKSPACE" -type f | wc -l | tr -d ' ') test files into $WORKSPACE"
  fi
  cd "$WORKSPACE"
}

main() {
  local channel="${1:-stable}"
  [ $# -gt 0 ] && shift
  [ "${1:-}" = "--" ] && shift
  local formula
  formula=$(formula_for "$channel")

  install_release "$formula"
  check_release "$formula"
  prepare_workspace

  if [ $# -gt 0 ]; then
    step "Running: $*"
    exec "$@"
  fi
  step "Ready: $formula $(btk --version) in $WORKSPACE. Try btk --help. Type exit or press Ctrl+D to remove the container."
  # bash exits with the status of the last command typed, which says nothing about the release.
  bash -l || true
}

main "$@"
