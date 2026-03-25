import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const RUN_COUNT = 100;

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function toMB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function toMs(value) {
  return Number(value.toFixed(2));
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findMainFile(rootDir) {
  const packageJsonPath = path.join(rootDir, 'package.json');

  if (await pathExists(packageJsonPath)) {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    if (packageJson.main) {
      const mainCandidate = path.resolve(rootDir, packageJson.main);
      if (await pathExists(mainCandidate)) {
        return mainCandidate;
      }
    }
  }

  const fallbackCandidates = [
    path.join(rootDir, 'index.js'),
    path.join(rootDir, 'src', 'index.js'),
    path.join(rootDir, 'src', 'main.js'),
    path.join(rootDir, 'src', 'cli.js')
  ];

  for (const candidate of fallbackCandidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate project's main JS file in: ${rootDir}`);
}

async function runSingleWorker(entryFilePath, argvSuffix = []) {
  return new Promise((resolve, reject) => {
    const entryUrl = pathToFileURL(entryFilePath).href;
    const entryPath = entryFilePath;

    const worker = new Worker(
      `
        const { parentPort, workerData } = require('node:worker_threads');
        const { performance } = require('node:perf_hooks');

        function restoreConsole(originalConsole) {
          console.log = originalConsole.log;
          console.error = originalConsole.error;
          console.warn = originalConsole.warn;
          console.info = originalConsole.info;
        }

        (async () => {
          const originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
          };
          const originalArgv = process.argv.slice();
          const originalExit = process.exit;
          const originalStdoutWrite = process.stdout.write.bind(process.stdout);
          const originalStderrWrite = process.stderr.write.bind(process.stderr);

          console.log = () => {};
          console.error = () => {};
          console.warn = () => {};
          console.info = () => {};
          process.stdout.write = () => true;
          process.stderr.write = () => true;

          process.argv = ['node', workerData.entryPath, ...(workerData.argvSuffix || [])];
          process.exit = (code = 0) => {
            const marker = new Error('__PROCESS_EXIT__');
            marker.exitCode = code;
            throw marker;
          };

          const started = performance.now();
          try {
            await import(workerData.entryUrl);
          } catch (error) {
            if (!(error && error.message === '__PROCESS_EXIT__')) {
              throw error;
            }
          }
          const ended = performance.now();
          const memory = process.memoryUsage();

          process.argv = originalArgv;
          process.exit = originalExit;
          process.stdout.write = originalStdoutWrite;
          process.stderr.write = originalStderrWrite;
          restoreConsole(originalConsole);

          parentPort.postMessage({
            durationMs: ended - started,
            rssBytes: memory.rss
          });
        })().catch((error) => {
          parentPort.postMessage({
            error: error && (error.stack || error.message) ? (error.stack || error.message) : String(error)
          });
        });
      `,
      {
        eval: true,
        workerData: { entryUrl, entryPath, argvSuffix }
      }
    );

    worker.once('message', (message) => {
      if (message.error) {
        reject(new Error(message.error));
        return;
      }

      resolve(message);
    });

    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

async function runBenchmarkSet(entryFilePath, runCount = RUN_COUNT, argvSuffix = []) {
  const durations = [];
  const memorySamples = [];

  for (let i = 0; i < runCount; i += 1) {
    const result = await runSingleWorker(entryFilePath, argvSuffix);
    durations.push(result.durationMs);
    memorySamples.push(result.rssBytes);
  }

  const avgTimeMs = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const p95LatencyMs = percentile(durations, 95);
  const peakMemoryMB = toMB(Math.max(...memorySamples));

  return {
    runs: runCount,
    avgTimeMs: toMs(avgTimeMs),
    p95LatencyMs: toMs(p95LatencyMs),
    peakMemoryMB
  };
}

function improvementPercent(beforeValue, afterValue) {
  if (beforeValue <= 0) {
    return 0;
  }

  return Number((((beforeValue - afterValue) / beforeValue) * 100).toFixed(2));
}

export async function benchmarkProject(dirPath = '.') {
  const rootDir = path.resolve(dirPath);
  const exists = await pathExists(rootDir);

  if (!exists) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const originalEntry = await findMainFile(rootDir);
  const optimizedEntry = path.join(rootDir, 'dist', 'benchmark', 'main.optimized.js');
  const entryBasename = path.basename(originalEntry).toLowerCase();
  const argvSuffix = entryBasename.includes('cli') ? ['--version'] : [];

  const before = await runBenchmarkSet(originalEntry, RUN_COUNT, argvSuffix);

  await fs.mkdir(path.dirname(optimizedEntry), { recursive: true });

  await build({
    entryPoints: [originalEntry],
    outfile: optimizedEntry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    minify: true,
    target: 'node18',
    logLevel: 'silent'
  });

  const after = await runBenchmarkSet(optimizedEntry, RUN_COUNT, argvSuffix);

  const timeImprovement = improvementPercent(before.avgTimeMs, after.avgTimeMs);
  const memoryImprovement = improvementPercent(before.peakMemoryMB, after.peakMemoryMB);
  const p95Improvement = improvementPercent(before.p95LatencyMs, after.p95LatencyMs);

  const comparisonRows = [
    {
      Metric: 'Avg time',
      Before: `${before.avgTimeMs}ms`,
      After: `${after.avgTimeMs}ms`,
      Improvement: `${timeImprovement}% faster`
    },
    {
      Metric: 'Peak memory',
      Before: `${before.peakMemoryMB}MB`,
      After: `${after.peakMemoryMB}MB`,
      Improvement: `${memoryImprovement}% less`
    },
    {
      Metric: 'P95 latency',
      Before: `${before.p95LatencyMs}ms`,
      After: `${after.p95LatencyMs}ms`,
      Improvement: `${p95Improvement}% faster`
    }
  ];

  console.table(comparisonRows);

  const report = {
    projectPath: rootDir,
    runCount: RUN_COUNT,
    originalEntry,
    optimizedEntry,
    before,
    after,
    improvements: {
      avgTimePercent: timeImprovement,
      peakMemoryPercent: memoryImprovement,
      p95LatencyPercent: p95Improvement
    },
    table: comparisonRows
  };

  const reportsDir = path.join(rootDir, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, 'benchmark.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  return {
    ...report,
    reportPath
  };
}
