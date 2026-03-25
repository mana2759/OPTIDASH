# OptiDash

![Optimization Score](./reports/badge.svg)

![Node](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![ESM](https://img.shields.io/badge/Module-ESM-1f6feb)
![Bundler](https://img.shields.io/badge/Bundling-esbuild-ffcf00)
![Dashboard](https://img.shields.io/badge/UI-Chart.js-ff6384)
![License](https://img.shields.io/badge/License-MIT-blue)
<!-- BENCHMARK_BADGES_START -->
![Size Reduction](https://img.shields.io/badge/Size%20Reduction-76.85%25-22c55e)
![Estimated Load Gain](https://img.shields.io/badge/Estimated%20Load%20Gain-76.85%25-0ea5e9)
![Speedup](https://img.shields.io/badge/Transfer%20Speedup-4.32x-a855f7)
<!-- BENCHMARK_BADGES_END -->

A professional optimization CLI and dashboard for analyzing, compressing, and reporting frontend/build assets.

- ⚡ Analyze project size and memory behavior
- 🧹 Remove unused imports and minify JS/CSS
- 📉 Track before/after size with visual dashboards
- 🌐 Serve a live dashboard with optimization APIs

## Table of Contents

- [Installation](#installation)
- [Usage](#usage)
- [Screenshots](#screenshots)
- [Before vs After](#before-vs-after)
- [Technical Optimization Details](#technical-optimization-details)
- [Benchmarks](#benchmarks)
- [How It's Optimized Itself](#how-its-optimized-itself)

## Installation

```bash
# 1) Clone
git clone https://github.com/your-org/optidash.git
cd optidash

# 2) Install dependencies
npm install
```

## Usage

### CLI Commands

```bash
# Analyze a project directory
node src/cli.js analyze .

# Optimize JS/CSS and write output into /dist
node src/cli.js optimize .

# Serve dashboard + live APIs at http://localhost:3000
node src/cli.js serve .

# Generate static HTML report in /reports
node src/cli.js report .
```

### NPM Script Shortcuts

```bash
npm run analyze
npm run build
npm run start
```

## Screenshots

Dashboard views to include in your project documentation:

- 📊 Main analytics board (file tree + charts)
- 🧠 Live memory timeline during optimization
- ✅ Optimization suggestions + progress updates

Tip: Capture screenshots while running `node src/cli.js serve .` and place them in your preferred docs/assets folder.

## Before vs After

Real reduction data from the latest project optimization run (gzipped output in /dist):

| File | Before (bytes) | After (gzip bytes) | Reduction |
|---|---:|---:|---:|
| src/cli.js | 12,895 | 2,968 | 76.98% |
| src/optimizer.js | 9,359 | 1,948 | 79.19% |
| src/analyzer.js | 5,174 | 1,163 | 77.52% |
| web/dashboard.js | 1,743 | 534 | 69.36% |
| src/reporter.js | 1,110 | 398 | 64.14% |
| **Total** | **30,281** | **7,011** | **76.85%** |

## Technical Optimization Details

### 1) Tree-shaking via esbuild

OptiDash uses esbuild with ESM output and minification to remove unused exports and reduce shipped JS.

```js
const minified = await transform(sourceCode, {
  loader: 'js',
  minify: true,
  format: 'esm'
});
```

### 2) Dead code elimination

The optimizer performs a pre-pass that removes unused import bindings by parsing import statements and testing identifier usage against the module body. This drops dead imports before minification.

- Parses `import default`, `import { named }`, and `import * as ns`
- Keeps side-effect imports intact
- Removes import clauses not referenced in executable code

### 3) CSS minification algorithm

A lightweight CSS compressor is applied in sequence:

1. Strip block comments (`/* ... */`)
2. Collapse consecutive whitespace
3. Trim token-adjacent whitespace around `{ } : ; , >`
4. Remove redundant `;}` patterns

This reduces transfer size while preserving valid CSS semantics for common stylesheets.

### 4) Lazy loading pattern used

OptiDash dashboard uses API-driven lazy loading:

- Loads report data only when needed (`fetch('./report.json')`)
- Polls memory timeline in 1-second intervals (`/api/memory`)
- Starts optimization on demand via user action (`POST /api/optimize`)
- Polls progress endpoint (`/api/optimize/progress`) instead of eager preloading

### 5) Memory profiling with `process.memoryUsage()`

The analyzer and server capture runtime memory stats to monitor optimization overhead.

```js
const memory = process.memoryUsage();
// rss, heapTotal, heapUsed, external, arrayBuffers
```

These values are surfaced in:

- Analyzer summary tables
- Dashboard memory timeline chart
- `/api/memory` for live runtime telemetry

## Benchmarks

From current project run:

- **X% size reduction:** **76.85%**
- **Y% faster load time:** **76.85%** estimated transfer-time improvement
- **Estimated transfer time saved:** **0.0186s** (assuming 1.25 MB/s throughput)
- **Approx speedup factor:** **4.32x** smaller transfer window

To auto-refresh benchmark badges after a new optimization run:

```bash
npm run bench:readme
```

## How It's Optimized Itself

OptiDash is engineered to keep the optimization core lean and mostly built on Node.js native modules.

- ✅ Core file scanning, parsing, serving, and telemetry rely on Node built-ins (`fs`, `path`, `http`, `zlib`, `process`)
- ✅ `esbuild` is the primary optimization engine
- ✅ Additional packages are used mainly for CLI UX and visualization ergonomics

Meta principle:

> The optimizer engine is designed so its essential optimization path can be reduced to a near-zero runtime dependency model, centered on esbuild + Node built-ins.

---

Built with ⚙️, 📊, and a healthy obsession for smaller bundles.
