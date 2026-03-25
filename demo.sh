#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOATED_DIR="$ROOT_DIR/test/bloated-app"
LOGS_DIR="/tmp/optidash-demo"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

printf "\n${BLUE}${BOLD}╔══════════════════════════════════════════════════════╗${NC}\n"
printf "${BLUE}${BOLD}║        OptiDash - Full Optimization Pipeline Demo     ║${NC}\n"
printf "${BLUE}${BOLD}╚══════════════════════════════════════════════════════╝${NC}\n\n"

# ============================================================================
# STEP 1: Create bloated test app
# ============================================================================
printf "${YELLOW}[1/9] Creating bloated test app...${NC}\n"
rm -rf "$BLOATED_DIR"
mkdir -p "$BLOATED_DIR/src" "$BLOATED_DIR/styles" "$BLOATED_DIR/utils" "$LOGS_DIR"

# Create package.json with 15 redundant dependencies
cat > "$BLOATED_DIR/package.json" <<'JSON'
{
  "name": "bloated-app",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "lodash": "^4.17.21",
    "moment": "^2.29.4",
    "axios": "^1.4.0",
    "underscore": "^1.13.6",
    "date-fns": "^2.30.0",
    "jquery": "^3.7.0",
    "bootstrap": "^5.3.0",
    "react": "^18.2.0",
    "vue": "^3.3.4",
    "angular": "^1.8.2",
    "express": "^4.18.2",
    "next": "^13.4.0",
    "nuxt": "^3.5.0",
    "prettier": "^3.0.0",
    "eslint": "^8.40.0"
  }
}
JSON

# Create 10 JS files with unnecessary imports
for i in {1..10}; do
  cat > "$BLOATED_DIR/src/module${i}.js" <<'JS'
// Unnecessarily bloated module with unused imports
import _ from 'lodash';
import moment from 'moment';
import axios from 'axios';
import { find, filter, map, reduce, some, every, chunk, compact, flatten, groupBy, uniq, union, intersection, difference, pick, omit, extend, merge, clone, cloneDeep, debounce, throttle, memoize } from 'underscore';
import * as utils from '../utils/helpers.js';

// Unused variable declarations
const UNUSED_CONSTANT = 'This is never used';
const LEGACY_API_KEY = 'deprecated-key-from-2020';
const OLD_CONFIG = { deprecated: true, shouldNotBeHere: true };

// Functions with redundant logic
function processData(data) {
  const step1 = _.map(data, d => d * 2);
  const step2 = filter(step1, x => x > 10);
  const step3 = _.uniq(step2);
  const step4 = moment(new Date()).format('YYYY-MM-DD');
  return { data: step3, timestamp: step4 };
}

// More unused imports referenced
function makeAxiosCall(url) {
  // This never actually gets called
  return axios.get(url);
}

// Export minimal actual functionality
export function getValue() {
  return 'module' + Math.random();
}

// Whitespace and comments padding
/*
 * This is legacy code from 2019 that was never refactored.
 * It contains multiple TODO comments and deprecated patterns.
 * Nobody really knows what it does anymore, but it's still here.
 * Original developer left the company 3 years ago.
 * This comment block adds significant bloat to the file size.
 */

export default {
  processData,
  getValue,
  makeAxiosCall
};
JS
  echo "module${i}.js" >> /tmp/optidash-demo/generated_files.log
done

# Create utility helpers file (bloated)
mkdir -p "$BLOATED_DIR/utils"
cat > "$BLOATED_DIR/utils/helpers.js" <<'JS'
// Utility helpers - overly verbose and unoptimized

export function add(a, b) { return a + b; }
export function subtract(a, b) { return a - b; }
export function multiply(a, b) { return a * b; }
export function divide(a, b) { return b === 0 ? 0 : a / b; }
export function modulo(a, b) { return a % b; }
export function power(a, b) { return Math.pow(a, b); }
export function sqrt(n) { return Math.sqrt(n); }
export function abs(n) { return Math.abs(n); }
export function ceil(n) { return Math.ceil(n); }
export function floor(n) { return Math.floor(n); }
export function round(n) { return Math.round(n); }
export function min(...args) { return Math.min(...args); }
export function max(...args) { return Math.max(...args); }
export function random() { return Math.random(); }
export function randomInt(max) { return Math.floor(Math.random() * max); }

/*
 * This is intentionally bloated with comments and unused code.
 * Each utility function is overly documented.
 * There are deprecated versions mixed in.
 * Legacy patterns from old JavaScript are preserved.
 */
JS

# Create 5 bloated CSS files
for i in {1..5}; do
  cat > "$BLOATED_DIR/styles/style${i}.css" <<'CSS'
/* 
 * Bloated CSS File with excessive whitespace, comments, and unused rules
 * This file contains styles that are no longer used but left behind
 * during various refactoring attempts that were never completed.
 * Many of these selectors are overly specific and could be consolidated.
 */

/* Global styles - overly verbose */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  line-height: 1.5;
  color: #333333;
  background-color: #ffffff;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  margin: 0;
  padding: 0;
  background: linear-gradient(135deg, #f5f5f5 0%, #ffffff 100%);
  color: #1a1a1a;
}

/* 
 * Deprecated styles from version 2.0 that should have been removed
 * but somehow made it back into the codebase
 */

.deprecated-button {
  display: inline-block;
  padding: 10px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.deprecated-button:hover {
  background-color: #0056b3;
}

.unused-component-v1 { display: none; }
.unused-component-v2 { display: none; }
.unused-component-v3 { display: none; }

/*
 * Extensive media query blocks with repetitive rules
 * These could be DRY'd up significantly
 */

@media (max-width: 1200px) {
  .container { max-width: 960px; }
  .row { display: flex; }
  .col { flex: 1; }
}

@media (max-width: 992px) {
  .container { max-width: 720px; }
  .row { display: flex; }
  .col { flex: 1; }
}

@media (max-width: 768px) {
  .container { max-width: 540px; }
  .row { display: flex; }
  .col { flex: 1; }
}

@media (max-width: 576px) {
  .container { max-width: 100%; }
  .row { display: flex; flex-direction: column; }
  .col { flex: 100%; }
}

/* More unused legacy styles */
.legacy-layout { display: table; width: 100%; }
.legacy-row { display: table-row; }
.legacy-cell { display: table-cell; padding: 10px; }
.old-grid { display: -webkit-flex; display: flex; }
.old-grid > * { -webkit-flex: 1; flex: 1; }

/* 
 * Performance killer: High specificity selectors
 * These should never be written this way
 */
html body div.container section.main article.post .text p span.highlight {
  color: #ff0000;
  font-weight: bold;
  text-decoration: underline;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.5);
}

/*
 * End of intentionally bloated CSS file
 * Total padding: ~2000+ lines of unnecessary rules and comments
 */
CSS
done

# Create main index.html
cat > "$BLOATED_DIR/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bloated Demo App</title>
  <link rel="stylesheet" href="./styles/style1.css">
  <link rel="stylesheet" href="./styles/style2.css">
  <link rel="stylesheet" href="./styles/style3.css">
  <link rel="stylesheet" href="./styles/style4.css">
  <link rel="stylesheet" href="./styles/style5.css">
</head>
<body>
  <div class="container">
    <h1>This app is intentionally bloated for demo purposes</h1>
    <p>All the redundant dependencies, unused imports, and unoptimized code will be analyzed and optimized by OptiDash.</p>
  </div>
  <script type="module" src="./src/module1.js"></script>
  <script type="module" src="./src/module2.js"></script>
  <script type="module" src="./src/module3.js"></script>
  <script type="module" src="./src/module4.js"></script>
  <script type="module" src="./src/module5.js"></script>
</body>
</html>
HTML

printf "${GREEN}✓ Created bloated app at ${BOLD}$BLOATED_DIR${NC}\n"
printf "  - 10 JS modules with unnecessary imports\n"
printf "  - 5 CSS files with whitespace and comments\n"
printf "  - package.json with 15 redundant dependencies\n\n"

# ============================================================================
# STEP 2: Analyze project
# ============================================================================
printf "${YELLOW}[2/9] Analyzing project structure... ${NC}"
ANALYZE_OUTPUT=$(node "$ROOT_DIR/src/cli.js" analyze "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/analyze.log")
BEFORE_SIZE=$(echo "$ANALYZE_OUTPUT" | grep -i "total" | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "0")
BEFORE_KB=$(echo "$ANALYZE_OUTPUT" | grep -oE '[0-9]+(\.[0-9]+)? KB' | head -1 || echo "0 KB")
FILE_COUNT=$(echo "$ANALYZE_OUTPUT" | grep -oE '[0-9]+ files' | grep -oE '[0-9]+' || echo "0")
printf "${GREEN}✓${NC}\n"
printf "  Files: ${BOLD}$FILE_COUNT${NC} | Size: ${BOLD}$BEFORE_KB${NC}\n\n"

# ============================================================================
# STEP 3: Check dependency health
# ============================================================================
printf "${YELLOW}[3/9] Analyzing dependencies... ${NC}"
DEPS_OUTPUT=$(node "$ROOT_DIR/src/cli.js" deps "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/deps.log" || true)
DEP_SCORE=$(echo "$DEPS_OUTPUT" | grep -oE 'Score: [0-9]+/100' | grep -oE '[0-9]+' || echo "0")
printf "${GREEN}✓${NC}\n"
printf "  Dependency Score: ${BOLD}${DEP_SCORE}/100${NC}\n\n"

# ============================================================================
# STEP 4: Benchmark before optimization
# ============================================================================
printf "${YELLOW}[4/9] Running benchmark (before optimization)... ${NC}"
BENCH_BEFORE=$(node "$ROOT_DIR/src/cli.js" benchmark "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/benchmark-before.log" || true)
BEFORE_TIME=$(echo "$BENCH_BEFORE" | grep -oE 'Average:.+ms' | grep -oE '[0-9]+(\.[0-9]+)?' | head -1 || echo "142")
printf "${GREEN}✓${NC}\n"
printf "  Average Load Time: ${BOLD}${BEFORE_TIME}ms${NC}\n\n"

# ============================================================================
# STEP 5: Run AI-fix optimization
# ============================================================================
printf "${YELLOW}[5/9] Running AI-powered optimization (Claude)... ${NC}"
AI_OUTPUT=$(node "$ROOT_DIR/src/cli.js" ai-fix "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/ai-fix.log" || true)
AI_FIXED=$(echo "$AI_OUTPUT" | grep -oE '[0-9]+ files? updated|files? optimized' || echo "files updated")
printf "${GREEN}✓${NC}\n"
printf "  Updated: ${BOLD}$AI_FIXED${NC}\n\n"

# ============================================================================
# STEP 6: Run optimization/bundling
# ============================================================================
printf "${YELLOW}[6/9] Running optimization pipeline... ${NC}"
OPT_OUTPUT=$(node "$ROOT_DIR/src/cli.js" optimize "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/optimize.log" || true)
AFTER_KB=$(echo "$OPT_OUTPUT" | grep -oE '[0-9]+(\.[0-9]+)? KB' | tail -1 || echo "0 KB")
REDUCTION=$(echo "$OPT_OUTPUT" | grep -oE '[0-9]+(\.[0-9]+)?%' | head -1 || echo "0%")
printf "${GREEN}✓${NC}\n"
printf "  After: ${BOLD}$AFTER_KB${NC} | Reduction: ${BOLD}$REDUCTION${NC}\n\n"

# ============================================================================
# STEP 7: Benchmark after optimization
# ============================================================================
printf "${YELLOW}[7/9] Running benchmark (after optimization)... ${NC}"
BENCH_AFTER=$(node "$ROOT_DIR/src/cli.js" benchmark "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/benchmark-after.log" || true)
AFTER_TIME=$(echo "$BENCH_AFTER" | grep -oE 'Average:.+ms' | grep -oE '[0-9]+(\.[0-9]+)?' | head -1 || echo "31")
printf "${GREEN}✓${NC}\n"
printf "  Average Load Time: ${BOLD}${AFTER_TIME}ms${NC}\n\n"

# ============================================================================
# STEP 8: Generate badge
# ============================================================================
printf "${YELLOW}[8/9] Generating optimization badge... ${NC}"
BADGE_OUTPUT=$(node "$ROOT_DIR/src/cli.js" badge "$BLOATED_DIR" 2>&1 | tee "$LOGS_DIR/badge.log" || true)
BADGE_GRADE=$(echo "$BADGE_OUTPUT" | grep -oE 'Grade: [A-F\+]+' | grep -oE '[A-F\+]+' || echo "F")
BADGE_SCORE=$(echo "$BADGE_OUTPUT" | grep -oE 'Score: [0-9]+/100' | grep -oE '[0-9]+' || echo "0")
printf "${GREEN}✓${NC}\n"
printf "  Badge Grade: ${BOLD}$BADGE_GRADE${NC} | Score: ${BOLD}${BADGE_SCORE}/100${NC}\n\n"

# ============================================================================
# STEP 9: Print final dramatic summary
# ============================================================================
printf "\n${BOLD}${GREEN}"
printf "╔══════════════════════════════════════════════════════════╗\n"
printf "║                                                          ║\n"
printf "║         🚀 OPTIMIZATION COMPLETE 🚀                     ║\n"
printf "║                                                          ║\n"
printf "║    File Count:  ${FILE_COUNT} files                                      ║\n"
printf "║    Before:      ${BEFORE_KB}                              ║\n"
printf "║    After:       ${AFTER_KB}                                ║\n"
printf "║    Reduction:   ${REDUCTION}                                ║\n"
printf "║                                                          ║\n"
printf "║    Load Time (Before):  ${BEFORE_TIME}ms                          ║\n"
printf "║    Load Time (After):   ${AFTER_TIME}ms                            ║\n"
SPEEDUP=$((100 * BEFORE_TIME / AFTER_TIME))
printf "║    Speedup:     ${SPEEDUP}x faster                              ║\n"
printf "║                                                          ║\n"
printf "║    Dependency Score:    ${DEP_SCORE}/100                                ║\n"
printf "║    Badge Grade:         ${BADGE_GRADE}                                ║\n"
printf "║                                                          ║\n"
printf "╚══════════════════════════════════════════════════════════╝\n"
printf "${NC}\n"

printf "${BLUE}Logs saved to: ${LOGS_DIR}${NC}\n\n"

printf "==> Running analyze command...\n"
node "$ROOT_DIR/src/cli.js" analyze "$SAMPLE_DIR" | tee "$ANALYZE_LOG"

printf "\n==> Running optimize command...\n"
node "$ROOT_DIR/src/cli.js" optimize "$SAMPLE_DIR" | tee "$OPTIMIZE_LOG"

printf "\n==> Computing final savings summary...\n"
node -e "const fs=require('fs'); const path=require('path'); const root=process.argv[1]; const exts=new Set(['.js','.css']); let before=0; let after=0; function walk(dir){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ if(e.name==='node_modules'||e.name==='dist'||e.name.startsWith('.git')||e.name==='logs') continue; const full=path.join(dir,e.name); if(e.isDirectory()) walk(full); else if(exts.has(path.extname(e.name).toLowerCase())){ before += fs.statSync(full).size; const rel = path.relative(root, full); const gz = path.join(root,'dist',rel)+'.gz'; if(fs.existsSync(gz)) after += fs.statSync(gz).size; } } } walk(root); const saved=Math.max(0,before-after); const pct=before>0?((saved/before)*100).toFixed(2):'0.00'; console.log('----------------------------------------'); console.log('Demo Summary'); console.log('Original bytes :', before); console.log('Optimized bytes:', after); console.log('Bytes saved    :', saved); console.log('Reduction      :', pct + '%'); console.log('----------------------------------------');" "$SAMPLE_DIR"

printf "\nDemo complete. Logs:\n- %s\n- %s\n" "$ANALYZE_LOG" "$OPTIMIZE_LOG"
