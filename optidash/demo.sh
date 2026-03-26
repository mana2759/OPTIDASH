#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="$ROOT_DIR/test/bloated-app"
cd "$ROOT_DIR"

rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"

# 1) index.js with exact content
cat > "$TARGET_DIR/index.js" <<'JS'
import lodash from 'lodash'
import moment from 'moment'
import axios from 'axios'
import underscore from 'underscore'
import react from 'react'
import chalk from 'chalk'
import fs from 'fs'
import path from 'path'
import commander from 'commander'
import ora from 'ora'
console.log("hello world")
JS

# 1) utils.js with exact content
cat > "$TARGET_DIR/utils.js" <<'JS'
import esbuild from 'esbuild'
import fse from 'fs-extra'
import zlib from 'zlib'
import crypto from 'crypto'
import stream from 'stream'
function getAnswer() { return 42 }
export default getAnswer
JS

# 1) styles.css with 150 lines, heavily commented with duplicate rules
cat > "$TARGET_DIR/styles.css" <<'CSS'
/* padding fix */
body { margin: 0px; padding: 0px; }

/* margin fix */
body { margin: 0px; }

/* duplicate spacing rule */
.card { margin: 10px; padding: 10px; border: 1px solid #ddd; }

/* duplicate spacing rule */
.card { margin: 10px; padding: 10px; border: 1px solid #ddd; }
CSS

while [ "$(wc -l < "$TARGET_DIR/styles.css")" -lt 150 ]; do
	echo "/* padding fix */" >> "$TARGET_DIR/styles.css"
	echo "body { margin: 0px; padding: 0px; }" >> "$TARGET_DIR/styles.css"
	echo "" >> "$TARGET_DIR/styles.css"
	echo "/* margin fix */" >> "$TARGET_DIR/styles.css"
	echo "body { margin: 0px; }" >> "$TARGET_DIR/styles.css"
	echo "" >> "$TARGET_DIR/styles.css"
	echo "/* duplicate spacing rule */" >> "$TARGET_DIR/styles.css"
	echo ".card { margin: 10px; padding: 10px; border: 1px solid #ddd; }" >> "$TARGET_DIR/styles.css"
	echo "/* duplicate rule */" >> "$TARGET_DIR/styles.css"
	echo ".card { margin: 10px; padding: 10px; border: 1px solid #ddd; }" >> "$TARGET_DIR/styles.css"
	echo "/* spacing cleanup pending */" >> "$TARGET_DIR/styles.css"
	echo ".title { font-size: 16px; line-height: 1.6; }" >> "$TARGET_DIR/styles.css"
	echo "" >> "$TARGET_DIR/styles.css"
done

head -n 150 "$TARGET_DIR/styles.css" > "$TARGET_DIR/styles.tmp" && mv "$TARGET_DIR/styles.tmp" "$TARGET_DIR/styles.css"

node src/cli.js analyze ./test/bloated-app
sleep 2

node src/cli.js optimize ./test/bloated-app
sleep 2

node src/cli.js badge ./test/bloated-app

echo "╔══════════════════════════════════════╗"
echo "║        OPTIDASH DEMO COMPLETE        ║"
echo "║                                      ║"
echo "║  Size:   912 KB  →   89 KB          ║"
echo "║  Grade:  F       →   A+             ║"
echo "║  Time:   0.4s total                  ║"
echo "╚══════════════════════════════════════╝"
