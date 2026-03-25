#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { analyzeProject } from './analyzer.js';
import { optimizeProject, selfOptimize } from './optimizer.js';
import { aiFixProject } from './ai-fixer.js';
import { benchmarkProject } from './benchmark.js';
import { printDependencyReport } from './dep-scorer.js';
import { watchProject } from './watcher.js';
import { printBadgeReport, getBadgeJSON } from './badge.js';

const program = new Command();
const PORT = 3000;

function showHeader() {
  const lines = [
    '   ____        __  _ ____            __    ',
    '  / __ \____  / /_(_) __ \____ ______/ /_   ',
    ' / / / / __ \/ __/ / / / / __ `/ ___/ __ \  ',
    '/ /_/ / /_/ / /_/ / /_/ / /_/ (__  ) / / /  ',
    '\\____/ .___/\\__/_/_____/\\__,_/____/_/ /_/   ',
    '     /_/                                      '
  ];

  const colors = [chalk.cyanBright, chalk.blueBright, chalk.greenBright, chalk.yellowBright, chalk.magentaBright, chalk.redBright];
  console.log();
  lines.forEach((line, index) => {
    console.log(colors[index % colors.length](line));
  });
  console.log(chalk.gray('Fast Project Analyzer + Optimizer'));
  console.log();
}

async function withSpinner(message, task) {
  const spinner = ora({ text: message, color: 'cyan' }).start();
  try {
    const result = await task();
    spinner.succeed(`${message} done`);
    return result;
  } catch (error) {
    spinner.fail(`${message} failed`);
    throw error;
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function reportTemplate(report) {
  const largestRows = report.largestFiles
    .map((file) => `<tr><td>${file.path}</td><td>${file.sizeBytes}</td><td>${file.sizeKB}</td></tr>`)
    .join('');

  const duplicateRows = report.duplicateDependencies.length > 0
    ? report.duplicateDependencies
        .map((dep) => `<tr><td>${dep.name}</td><td>${dep.sections}</td><td>${dep.versions}</td></tr>`)
        .join('')
    : '<tr><td colspan="3">No duplicate dependencies found</td></tr>';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OptiDash Report</title>
    <style>
      body { font-family: Segoe UI, Tahoma, sans-serif; background: #f6f8fb; color: #102a43; margin: 0; }
      .wrap { max-width: 980px; margin: 24px auto; padding: 0 16px; }
      .card { background: #fff; border-radius: 12px; padding: 18px; box-shadow: 0 10px 22px rgba(15, 23, 42, 0.07); margin-bottom: 16px; }
      h1, h2 { margin: 0 0 10px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
      .item { border: 1px solid #d9e2ec; border-radius: 8px; padding: 10px; }
      .label { font-size: 12px; color: #486581; }
      .value { font-weight: 700; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { text-align: left; border-bottom: 1px solid #e4e7eb; padding: 8px; font-size: 14px; }
      th { color: #486581; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h1>OptiDash Report</h1>
        <div class="grid">
          <div class="item"><div class="label">Directory</div><div class="value">${report.dirPath}</div></div>
          <div class="item"><div class="label">Files</div><div class="value">${report.fileCount}</div></div>
          <div class="item"><div class="label">Total Size</div><div class="value">${formatBytes(report.totalSize)}</div></div>
          <div class="item"><div class="label">Execution Time</div><div class="value">${report.executionTimeMs} ms</div></div>
        </div>
      </div>

      <div class="card">
        <h2>Largest Files (Top 5)</h2>
        <table>
          <thead><tr><th>File</th><th>Size (bytes)</th><th>Size (KB)</th></tr></thead>
          <tbody>${largestRows}</tbody>
        </table>
      </div>

      <div class="card">
        <h2>Duplicate Dependencies</h2>
        <table>
          <thead><tr><th>Package</th><th>Sections</th><th>Versions</th></tr></thead>
          <tbody>${duplicateRows}</tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;
}

async function resolveWebRoot(targetPath) {
  const resolved = path.resolve(targetPath);
  const stat = await fs.stat(resolved);

  if (stat.isDirectory()) {
    const candidate = path.join(resolved, 'web');
    try {
      const webStat = await fs.stat(candidate);
      if (webStat.isDirectory()) {
        return candidate;
      }
    } catch {
      return resolved;
    }
    return resolved;
  }

  throw new Error(`Path must be a directory: ${resolved}`);
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.html') {
    return 'text/html; charset=utf-8';
  }
  if (extension === '.js') {
    return 'application/javascript; charset=utf-8';
  }
  if (extension === '.json') {
    return 'application/json; charset=utf-8';
  }
  if (extension === '.css') {
    return 'text/css; charset=utf-8';
  }
  return 'application/octet-stream';
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

program
  .name('optidash')
  .description('Analyze, optimize, serve, and report project assets.')
  .version('1.0.0');

program
  .command('analyze <path>')
  .description('Runs the analyzer and prints report tables.')
  .action(async (targetPath) => {
    try {
      showHeader();
      const analysis = await withSpinner('Analyzing project', async () => analyzeProject(targetPath));
      console.log(chalk.green(`Total size: ${formatBytes(analysis.totalSize)}`));
      console.log(chalk.green(`File count: ${analysis.fileCount}`));
    } catch (error) {
      console.error(chalk.red(`Analyze failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('optimize <path>')
  .description('Runs optimizer and shows before/after stats.')
  .action(async (targetPath) => {
    try {
      showHeader();
      const stats = await withSpinner('Optimizing project', async () => optimizeProject(targetPath, {}));
      console.log(chalk.cyan(`Original size: ${formatBytes(stats.originalSize)}`));
      console.log(chalk.cyan(`Optimized size (gz): ${formatBytes(stats.optimizedSize)}`));
      console.log(chalk.cyan(`Reduction: ${stats.reductionPercent}%`));
      console.log(chalk.cyan(`Estimated time saved: ${stats.timeSaved}s`));
    } catch (error) {
      console.error(chalk.red(`Optimize failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('self-optimize')
  .description('Bundles OptiDash into a single self-contained Node bundle and compares size against node_modules.')
  .action(async () => {
    try {
      showHeader();
      const stats = await withSpinner('Self-optimizing OptiDash', async () => selfOptimize('.'));
      console.log(chalk.green(`Self bundle output: ${stats.bundleOutput}`));
      console.log(chalk.green(`Reduction vs node_modules: ${stats.reductionPercent}%`));
    } catch (error) {
      console.error(chalk.red(`Self-optimize failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('ai-fix <path>')
  .description('Uses Claude Sonnet to optimize JS/TS files and writes outputs to dist/ai-fixed.')
  .action(async (targetPath) => {
    try {
      showHeader();
      const result = await withSpinner('Running AI optimizer', async () => aiFixProject(targetPath));
      console.log(chalk.green(result.summaryLine));
      console.log(chalk.gray(`Output directory: ${result.outputRoot}`));
    } catch (error) {
      console.error(chalk.red(`AI fix failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('benchmark <path>')
  .description('Runs 100x before/after benchmark with worker_threads and saves reports/benchmark.json.')
  .action(async (targetPath) => {
    try {
      showHeader();
      const result = await withSpinner('Running benchmark suite', async () => benchmarkProject(targetPath));
      console.log(chalk.green(`Benchmark report saved: ${result.reportPath}`));
    } catch (error) {
      console.error(chalk.red(`Benchmark failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('deps <path>')
  .description('Analyzes project dependencies: size, redundancy, tree-shakeability.')
  .action(async (targetPath) => {
    try {
      showHeader();
      await withSpinner('Analyzing dependencies', async () => printDependencyReport(targetPath));
    } catch (error) {
      console.error(chalk.red(`Deps failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('watch <path>')
  .description('Watches for file changes and updates live project metrics.')
  .action(async (targetPath) => {
    try {
      showHeader();
      await watchProject(targetPath);
    } catch (error) {
      console.error(chalk.red(`Watch failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('badge <path>')
  .description('Generates an optimization score badge (SVG) and updates README.')
  .action(async (targetPath) => {
    try {
      showHeader();
      await withSpinner('Generating badge', async () => printBadgeReport(targetPath));
    } catch (error) {
      console.error(chalk.red(`Badge failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('serve <path>')
  .description('Starts a local web dashboard on port 3000.')
  .action(async (targetPath) => {
    try {
      showHeader();
      const projectRoot = path.resolve(targetPath);
      const webRoot = await withSpinner('Preparing dashboard server', async () => resolveWebRoot(targetPath));
      const optimizeState = {
        running: false,
        progress: 0,
        status: 'idle',
        processed: 0,
        total: 0,
        lastResult: null,
        error: null
      };

      const server = http.createServer(async (req, res) => {
        try {
          const requestUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
          const urlPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;

          if (requestUrl.pathname === '/api/memory') {
            const memory = process.memoryUsage();
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(memory));
            return;
          }

          if (requestUrl.pathname === '/api/optimize/progress') {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(optimizeState));
            return;
          }

          if (requestUrl.pathname === '/api/optimize' && req.method === 'POST') {
            if (optimizeState.running) {
              res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: 'Optimization already running' }));
              return;
            }

            const body = await readRequestBody(req);
            const suggestions = Array.isArray(body.suggestions) ? body.suggestions : [];

            optimizeState.running = true;
            optimizeState.progress = 0;
            optimizeState.status = 'starting';
            optimizeState.processed = 0;
            optimizeState.total = 0;
            optimizeState.error = null;

            try {
              const result = await optimizeProject(projectRoot, {
                showProgressBar: false,
                onProgress: (progressInfo) => {
                  optimizeState.progress = progressInfo.progress;
                  optimizeState.status = progressInfo.status;
                  optimizeState.processed = progressInfo.processed;
                  optimizeState.total = progressInfo.total;
                }
              });

              const analysis = await analyzeProject(projectRoot);
              const reportPath = path.join(webRoot, 'report.json');
              await fs.writeFile(reportPath, JSON.stringify(analysis, null, 2), 'utf8');

              optimizeState.running = false;
              optimizeState.progress = 100;
              optimizeState.status = 'complete';
              optimizeState.lastResult = {
                ...result,
                suggestionsApplied: suggestions,
                reportPath
              };

              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(optimizeState.lastResult));
              return;
            } catch (error) {
              optimizeState.running = false;
              optimizeState.status = 'failed';
              optimizeState.error = error.message;

              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: error.message }));
              return;
            }
          }

          if (requestUrl.pathname === '/api/badge') {
            try {
              const badgeData = await getBadgeJSON(projectRoot);
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify(badgeData));
              return;
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: error.message }));
              return;
            }
          }

          if (requestUrl.pathname.startsWith('/api/')) {
            res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'API endpoint not found' }));
            return;
          }

          const safePath = path.normalize(urlPath || '/index.html').replace(/^\/+/, '');
          const candidateFile = path.join(webRoot, safePath);
          const resolvedFile = path.resolve(candidateFile);
          const rootResolved = path.resolve(webRoot);

          if (!resolvedFile.startsWith(rootResolved)) {
            res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Forbidden');
            return;
          }

          const data = await fs.readFile(resolvedFile);
          res.writeHead(200, { 'Content-Type': getMimeType(resolvedFile) });
          res.end(data);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      });

      server.listen(PORT, () => {
        console.log(chalk.green(`Dashboard running at http://localhost:${PORT}`));
        console.log(chalk.gray(`Serving: ${webRoot}`));
      });
    } catch (error) {
      console.error(chalk.red(`Serve failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program
  .command('report <path>')
  .description('Generates an HTML report and saves it to /reports/.')
  .action(async (targetPath) => {
    try {
      showHeader();
      const analysis = await withSpinner('Generating report', async () => analyzeProject(targetPath));

      const reportsDir = path.join(path.resolve(targetPath), 'reports');
      await fs.mkdir(reportsDir, { recursive: true });

      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = path.join(reportsDir, `report-${stamp}.html`);
      const html = reportTemplate(analysis);
      await fs.writeFile(filePath, html, 'utf8');

      console.log(chalk.green(`HTML report saved: ${filePath}`));
    } catch (error) {
      console.error(chalk.red(`Report failed: ${error.message}`));
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
