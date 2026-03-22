#!/usr/bin/env bash
set -euo pipefail

# ─── Shell compatibility check ────────────────────────────────────────────────
# Works on bash 3.2+ (macOS default) and bash 4/5 (Linux, Homebrew bash)
# Does NOT require bash 4 features (no declare -A, no ${var,,}, etc.)

# ─────────────────────────────────────────────────────────────────────────────
# Azure DevOps Release Notes MCP Plugin — Interactive Setup Wizard
# ─────────────────────────────────────────────────────────────────────────────

BOLD="\033[1m"
DIM="\033[2m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USE_TSNODE=false   # set to true if build fails, falls back to ts-node
ENV_FILE="$SCRIPT_DIR/.env"
CLAUDE_CONFIG_DIR="$HOME/.claude"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

# ─── Helpers ──────────────────────────────────────────────────────────────────

print_header() {
  echo ""
  echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${CYAN}║   Azure DevOps Release Notes — MCP Plugin Setup          ║${RESET}"
  echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

print_step() {
  echo ""
  echo -e "${BOLD}▶ $1${RESET}"
}

print_success() {
  echo -e "${GREEN}  ✓ $1${RESET}"
}

print_warning() {
  echo -e "${YELLOW}  ⚠ $1${RESET}"
}

print_error() {
  echo -e "${RED}  ✗ $1${RESET}"
}

print_info() {
  echo -e "${DIM}  $1${RESET}"
}

# Prompt with a default value shown in brackets
prompt_with_default() {
  local var_name="$1"
  local prompt_text="$2"
  local default_val="$3"
  local is_secret="${4:-false}"

  if [[ "$is_secret" == "true" ]]; then
    printf "  %s: " "$prompt_text"
    read -rs input_val
    echo ""
  else
    if [[ -n "$default_val" ]]; then
      printf "  %s [%s]: " "$prompt_text" "$default_val"
    else
      printf "  %s: " "$prompt_text"
    fi
    read -r input_val
  fi

  if [[ -z "$input_val" && -n "$default_val" ]]; then
    input_val="$default_val"
  fi

  eval "$var_name=\"$input_val\""
}

# Yes/no prompt — returns 0 for yes, 1 for no
confirm() {
  local prompt_text="$1"
  local default="${2:-y}"
  local hint
  if [[ "$default" == "y" ]]; then hint="Y/n"; else hint="y/N"; fi
  printf "  %s [%s]: " "$prompt_text" "$hint"
  read -r answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

check_dependency() {
  if ! command -v "$1" &>/dev/null; then
    print_error "$1 is not installed. Please install it and re-run this script."
    exit 1
  fi
}

# ─── Preflight checks ─────────────────────────────────────────────────────────

preflight_checks() {
  print_step "Checking prerequisites"

  check_dependency "node"
  local node_version
  node_version=$(node --version | sed 's/v//' | cut -d. -f1)
  if [[ "$node_version" -lt 18 ]]; then
    print_error "Node.js 18 or higher is required. You have v$(node --version)."
    exit 1
  fi
  print_success "Node.js $(node --version)"

  check_dependency "npm"
  print_success "npm $(npm --version)"

  if ! command -v jq &>/dev/null; then
    print_warning "jq is not installed — Claude Code config will need to be updated manually."
    JQ_AVAILABLE=false
  else
    JQ_AVAILABLE=true
    print_success "jq $(jq --version)"
  fi
}

# ─── Load existing .env values as defaults ────────────────────────────────────
# Uses grep instead of associative arrays — compatible with bash 3.2 (macOS default)

load_existing_env() {
  if [[ -f "$ENV_FILE" ]]; then
    print_info "Found existing .env — pre-filling defaults."
  fi
}

get_env_default() {
  local key="$1"
  local fallback="${2:-}"
  if [[ -f "$ENV_FILE" ]]; then
    local val
    val=$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
    if [[ -n "$val" ]]; then
      echo "$val"
      return
    fi
  fi
  echo "$fallback"
}

# ─── Collect Azure DevOps config ──────────────────────────────────────────────

collect_azure_config() {
  print_step "Azure DevOps credentials"
  echo ""

  # If a PAT already exists in .env, reuse it silently — never re-prompt for security
  local existing_pat
  existing_pat=$(get_env_default AZURE_DEVOPS_PAT "")

  if [[ -n "$existing_pat" ]]; then
    PAT="$existing_pat"
    print_success "PAT loaded from existing .env (${#PAT} chars) — press Enter to keep it, or paste a new one:"
    printf "  New Personal Access Token (leave blank to keep existing): "
    read -rs new_pat
    echo ""
    if [[ -n "$new_pat" ]]; then
      PAT="$new_pat"
      print_info "Using new PAT."
    else
      print_info "Keeping existing PAT."
    fi
  else
    print_info "You'll need a Personal Access Token (PAT) from Azure DevOps."
    print_info "Go to: dev.azure.com → User Settings → Personal Access Tokens"
    print_info "Required scopes: Work Items (Read), Wiki (Read+Write), Queries (Read+Write)"
    echo ""
    prompt_with_default PAT "Personal Access Token" "" true
  fi

  if [[ -z "$PAT" ]]; then
    print_error "PAT is required. Exiting."
    exit 1
  fi
}

# ─── Collect work item config ─────────────────────────────────────────────────

collect_workitem_config() {
  print_step "Work item configuration"
  echo ""
  print_info "Work item types to include in release notes (comma-separated)."
  print_info "Available types: User Story, Bug, Task, Feature, Epic"
  echo ""

  prompt_with_default WORK_ITEM_TYPES \
    "Work item types" \
    "$(get_env_default AZURE_DEVOPS_WORK_ITEM_TYPES "User Story,Bug,Feature")"

  echo ""
  print_info "Iteration path prefix — the base path before the sprint name."
  print_info "Example: if your full iteration path is 'MyProject\\\\Team A\\\\Sprint 42',"
  print_info "the prefix is 'MyProject\\\\Team A'"
  echo ""

  prompt_with_default ITERATION_PATH_PREFIX \
    "Iteration path prefix" \
    "$(get_env_default AZURE_DEVOPS_ITERATION_PATH_PREFIX "${PROJECT:-}")"

  prompt_with_default SHARED_QUERY_PATH \
    "Shared query folder path" \
    "$(get_env_default AZURE_DEVOPS_SHARED_QUERY_PATH "Shared Queries/Release Notes")"
}

# ─── Collect wiki config ──────────────────────────────────────────────────────

collect_wiki_config() {
  print_step "Wiki configuration"
  echo ""
  print_info "Open your Azure DevOps Wiki in a browser, navigate to the folder"
  print_info "where you want release notes stored, and paste the full URL below."
  print_info "Example:"
  print_info "  https://dev.azure.com/myorg/MyProject/_wiki/wikis/MyProject.wiki?pagePath=/Releases"
  echo ""

  prompt_with_default WIKI_URL \
    "Wiki URL" \
    "$(get_env_default AZURE_DEVOPS_WIKI_URL)"

  if [[ -z "$WIKI_URL" ]]; then
    print_error "Wiki URL is required. Exiting."
    exit 1
  fi

  # Parse org and project from the URL for use in validate_connection
  ORG=$(echo "$WIKI_URL" | sed 's|https://dev.azure.com/||' | cut -d'/' -f1)
  PROJECT=$(echo "$WIKI_URL" | sed 's|https://dev.azure.com/||' | cut -d'/' -f2)

  echo ""
  print_info "Release note page name format — {{sprintName}} is replaced with the sprint name."
  print_info "Default: {{sprintName}}  →  e.g. Sprint-42"
  print_info "Example: Release-{{sprintName}}  →  Release-Sprint-42"
  echo ""

  prompt_with_default RELEASE_NOTE_NAME_FORMAT \
    "Release note name format" \
    "$(get_env_default RELEASE_NOTE_NAME_FORMAT "{{sprintName}}")"
}

# ─── Write .env ───────────────────────────────────────────────────────────────

write_env_file() {
  print_step "Writing .env file"

  cat > "$ENV_FILE" <<EOF
# Azure DevOps Configuration
# Generated by setup.sh on $(date)

AZURE_DEVOPS_PAT=${PAT}

# Wiki URL — paste from your browser when viewing the wiki folder for release notes
AZURE_DEVOPS_WIKI_URL=${WIKI_URL}

# Work Items Configuration
AZURE_DEVOPS_WORK_ITEM_TYPES=${WORK_ITEM_TYPES}

# Iteration / Sprint Configuration
AZURE_DEVOPS_ITERATION_PATH_PREFIX=${ITERATION_PATH_PREFIX}

# Shared Query Configuration
AZURE_DEVOPS_SHARED_QUERY_PATH=${SHARED_QUERY_PATH}

# Release Note Page Name Format ({{sprintName}} is replaced with the sprint name)
RELEASE_NOTE_NAME_FORMAT=${RELEASE_NOTE_NAME_FORMAT}
EOF

  chmod 600 "$ENV_FILE"
  print_success ".env written (permissions set to 600 — readable only by you)"
}

# ─── Install dependencies ─────────────────────────────────────────────────────

install_dependencies() {
  print_step "Installing dependencies"

  cd "$SCRIPT_DIR"
  if [[ -d "node_modules" ]]; then
    print_info "node_modules already exists — skipping install."
  else
    npm install --silent
    print_success "Dependencies installed"
  fi
}

# ─── Build TypeScript ─────────────────────────────────────────────────────────

build_project() {
  print_step "Building TypeScript"

  cd "$SCRIPT_DIR"

  # Pass --max-old-space-size to avoid heap OOM on machines with limited RAM
  # (common on macOS with Apple Silicon running Node 22+)
  if NODE_OPTIONS="--max-old-space-size=4096" npm run build; then
    print_success "Build complete → dist/"
  else
    echo ""
    print_error "TypeScript build failed."
    echo ""
    echo -e "  ${DIM}Common fixes:${RESET}"
    echo -e "  ${DIM}1. Try building manually with more memory:${RESET}"
    echo -e "  ${CYAN}     NODE_OPTIONS=--max-old-space-size=8192 npm run build${RESET}"
    echo -e "  ${DIM}2. Or skip the build and use ts-node (dev mode):${RESET}"
    echo -e "  ${CYAN}     npm run dev${RESET}"
    echo -e "  ${DIM}3. Or use ts-node in your Claude Code config instead of node dist/index.js${RESET}"
    echo ""
    if confirm "Continue setup anyway (you can build manually later)?"; then
      print_warning "Skipping build — Claude Code config will use ts-node instead."
      USE_TSNODE=true
    else
      exit 1
    fi
  fi
}

# ─── Update Claude Code config ────────────────────────────────────────────────

update_claude_config() {
  print_step "Registering with Claude Code"

  local cmd
  local args

  if [[ "${USE_TSNODE:-false}" == "true" ]]; then
    cmd="npx"
    args="ts-node ${SCRIPT_DIR}/src/index.ts"
    print_info "Using ts-node mode (no compiled build required)"
  else
    cmd="node"
    args="${SCRIPT_DIR}/dist/index.js"
  fi

  # ── Method 1: use the official claude mcp add command (Claude Code CLI) ──────
  if command -v claude &>/dev/null; then
    # Remove existing entry first to avoid duplicates, then re-add
    claude mcp remove azure-devops-release-notes --scope user 2>/dev/null || true

    if [[ "${USE_TSNODE:-false}" == "true" ]]; then
      claude mcp add azure-devops-release-notes         --scope user         -- npx ts-node "${SCRIPT_DIR}/src/index.ts" 2>/dev/null && {
        print_success "MCP server registered via: claude mcp add"
        return
      }
    else
      claude mcp add azure-devops-release-notes         --scope user         -- node "${SCRIPT_DIR}/dist/index.js" 2>/dev/null && {
        print_success "MCP server registered via: claude mcp add"
        return
      }
    fi
    print_warning "claude mcp add failed — falling back to direct config file edit"
  fi

  # ── Method 2: write ~/.claude.json directly (Claude Code stores MCP here) ────
  local claude_json="$HOME/.claude.json"

  if [[ ! -f "$claude_json" ]]; then
    echo "{}" > "$claude_json"
    print_info "Created $claude_json"
  fi

  if [[ "$JQ_AVAILABLE" == "false" ]]; then
    echo ""
    print_warning "jq not found — please register the MCP server manually."
    echo ""
    print_info "Run this command:"
    echo ""
    if [[ "${USE_TSNODE:-false}" == "true" ]]; then
      echo -e "  ${CYAN}claude mcp add azure-devops-release-notes --scope user -- npx ts-node ${SCRIPT_DIR}/src/index.ts${RESET}"
    else
      echo -e "  ${CYAN}claude mcp add azure-devops-release-notes --scope user -- node ${SCRIPT_DIR}/dist/index.js${RESET}"
    fi
    echo ""
    return
  fi

  # Back up
  cp "$claude_json" "${claude_json}.backup" 2>/dev/null || true

  local server_config
  if [[ "${USE_TSNODE:-false}" == "true" ]]; then
    server_config="{"command":"npx","args":["ts-node","${SCRIPT_DIR}/src/index.ts"],"cwd":"${SCRIPT_DIR}"}"
  else
    server_config="{"command":"node","args":["${SCRIPT_DIR}/dist/index.js"],"cwd":"${SCRIPT_DIR}"}"
  fi

  local updated
  updated=$(jq     --argjson config "$server_config"     '.mcpServers["azure-devops-release-notes"] = $config'     "$claude_json" 2>/dev/null) || {
    print_error "Failed to update $claude_json — please register manually (see above)"
    return
  }

  echo "$updated" > "$claude_json"
  print_success "MCP server registered in: $claude_json"
}

# ─── Validate connection ──────────────────────────────────────────────────────

validate_connection() {
  print_step "Testing Azure DevOps connection"

  local url="https://dev.azure.com/${ORG}/${PROJECT}/_apis/project?api-version=7.1"
  local auth
  auth=$(echo -n ":${PAT}" | base64)

  local http_status
  http_status=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Basic $auth" \
    -H "Accept: application/json" \
    "$url" 2>/dev/null || echo "000")

  if [[ "$http_status" == "200" ]]; then
    print_success "Connection successful — org: $ORG, project: $PROJECT"
  elif [[ "$http_status" == "401" ]]; then
    print_warning "Authentication failed (401) — check your PAT token and scopes."
  elif [[ "$http_status" == "403" ]]; then
    print_warning "Permission denied (403) — check your PAT scopes."
  elif [[ "$http_status" == "404" ]]; then
    print_warning "Project not found (404) — check org name and project name."
  elif [[ "$http_status" == "000" ]]; then
    print_warning "Could not reach Azure DevOps — check your internet connection."
  else
    print_warning "Unexpected response ($http_status) — you can validate manually later."
  fi
}

# ─── Print summary ────────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║   Setup complete!                                        ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${BOLD}Your plugin is ready.${RESET} Restart Claude Code and try:"
  echo ""
  echo -e "  ${CYAN}/generate release note for Sprint 42${RESET}"
  echo -e "  ${CYAN}/configure-release-notes${RESET}"
  echo -e "  ${CYAN}validate my Azure DevOps connection${RESET}"
  echo ""
  echo -e "  ${DIM}Config file : $ENV_FILE${RESET}"
  echo -e "  ${DIM}Claude config: $CLAUDE_CONFIG_FILE${RESET}"
  echo -e "  ${DIM}Template    : $SCRIPT_DIR/release-note-template.md${RESET}"
  echo ""
  echo -e "  ${DIM}To re-run full setup: ./setup.sh${RESET}"
  echo -e "  ${DIM}After a git pull, just run: ./setup.sh --update${RESET}"
  echo ""
}

# ─── Update mode (after git pull) ────────────────────────────────────────────

run_update() {
  print_header

  echo -e "  ${BOLD}Update mode${RESET} — rebuilding after git pull."
  echo -e "  ${DIM}Your .env configuration is untouched.${RESET}"
  echo ""

  preflight_checks

  # Check .env still exists
  if [[ ! -f "$ENV_FILE" ]]; then
    print_error ".env file not found at $ENV_FILE"
    echo -e "  ${DIM}Looks like this is a fresh clone. Run ./setup.sh (without --update) instead.${RESET}"
    exit 1
  fi
  print_success ".env found — configuration intact"

  # Check if package.json dependencies changed
  print_step "Checking dependencies"
  if [[ ! -d "$SCRIPT_DIR/node_modules" ]]; then
    print_info "node_modules missing — running npm install"
    install_dependencies
  else
    print_info "Running npm install to pick up any new packages"
    cd "$SCRIPT_DIR" && npm install --silent
    print_success "Dependencies up to date"
  fi

  # Rebuild
  build_project

  # Always register with Claude Code — may be missing on a new machine
  print_step "Checking Claude Code registration"

  # Check both possible config locations
  local already_registered=false
  if command -v claude &>/dev/null; then
    claude mcp list 2>/dev/null | grep -q "azure-devops-release-notes" && already_registered=true
  fi

  if [[ "$already_registered" == "true" ]]; then
    print_success "MCP server already registered"
  else
    print_info "MCP server not found in claude mcp list — registering for this machine"
    update_claude_config
  fi

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║   Update complete!                                       ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  Plugin rebuilt successfully. Restart Claude Code to use the latest version."
  echo ""
  echo -e "  ${DIM}To do a full reconfiguration: ./setup.sh (without --update)${RESET}"
  echo ""
}

# ─── Main flow ────────────────────────────────────────────────────────────────

main() {
  # Handle --update / --upgrade flag for post-pull rebuilds
  if [[ "${1:-}" == "--update" || "${1:-}" == "--upgrade" ]]; then
    run_update
    exit 0
  fi

  # Handle --help flag
  if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo ""
    echo -e "${BOLD}Azure DevOps Release Notes — Setup Script${RESET}"
    echo ""
    echo "  ./setup.sh            Full setup wizard (first time)"
    echo "  ./setup.sh --update   Rebuild after git pull (keeps your .env)"
    echo "  ./setup.sh --help     Show this help"
    echo ""
    exit 0
  fi

  print_header

  preflight_checks
  load_existing_env

  echo ""
  echo -e "  This wizard will configure the plugin and register it with Claude Code."
  echo -e "  ${DIM}Press Enter to accept the value shown in [brackets].${RESET}"

  collect_azure_config
  collect_wiki_config
  collect_workitem_config

  echo ""
  echo -e "${BOLD}  Ready to set up with these values:${RESET}"
  echo -e "  ${DIM}Wiki URL: $WIKI_URL${RESET}"
  echo -e "  ${DIM}Work item types: $WORK_ITEM_TYPES${RESET}"
  echo ""

  if ! confirm "Proceed with setup?"; then
    echo "  Setup cancelled. No files were written."
    exit 0
  fi

  write_env_file

  if confirm "Install npm dependencies now?"; then
    install_dependencies
  fi

  if confirm "Build the project now?"; then
    build_project
  fi

  if confirm "Test Azure DevOps connection?"; then
    validate_connection
  fi

  update_claude_config

  print_summary
}

main "$@"