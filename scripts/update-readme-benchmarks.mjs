import { readdir, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const readmePath = path.join(rootDir, 'README.md');
const sourceExtensions = new Set(['.js', '.css']);

function encodeBadgeValue(value) {
  return encodeURIComponent(value).replace(/%20/g, '%20');
}

async function walkFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkFiles(fullPath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (sourceExtensions.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

async function fileExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function computeBenchmark() {
  const files = await walkFiles(rootDir);

  let originalSize = 0;
  let optimizedSize = 0;

  for (const sourceFile of files) {
    const relative = path.relative(rootDir, sourceFile);
    const gzipPath = path.join(rootDir, 'dist', relative) + '.gz';

    if (!(await fileExists(gzipPath))) {
      continue;
    }

    const srcStat = await stat(sourceFile);
    const gzStat = await stat(gzipPath);

    originalSize += srcStat.size;
    optimizedSize += gzStat.size;
  }

  if (originalSize === 0) {
    return {
      reductionPercent: '0.00',
      loadGainPercent: '0.00',
      speedupFactor: '1.00x'
    };
  }

  const reduction = ((originalSize - optimizedSize) / originalSize) * 100;
  const speedup = optimizedSize > 0 ? originalSize / optimizedSize : 1;

  return {
    reductionPercent: reduction.toFixed(2),
    loadGainPercent: reduction.toFixed(2),
    speedupFactor: `${speedup.toFixed(2)}x`
  };
}

function buildBadgeBlock(metrics) {
  const reductionLabel = encodeBadgeValue(`${metrics.reductionPercent}%`);
  const loadGainLabel = encodeBadgeValue(`${metrics.loadGainPercent}%`);
  const speedupLabel = encodeBadgeValue(metrics.speedupFactor);

  return [
    '<!-- BENCHMARK_BADGES_START -->',
    `![Size Reduction](https://img.shields.io/badge/Size%20Reduction-${reductionLabel}-22c55e)`,
    `![Estimated Load Gain](https://img.shields.io/badge/Estimated%20Load%20Gain-${loadGainLabel}-0ea5e9)`,
    `![Speedup](https://img.shields.io/badge/Transfer%20Speedup-${speedupLabel}-a855f7)`,
    '<!-- BENCHMARK_BADGES_END -->'
  ].join('\n');
}

async function main() {
  const metrics = await computeBenchmark();
  const readme = await readFile(readmePath, 'utf8');

  const startMarker = '<!-- BENCHMARK_BADGES_START -->';
  const endMarker = '<!-- BENCHMARK_BADGES_END -->';
  const blockRegex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  const nextBlock = buildBadgeBlock(metrics);

  if (!blockRegex.test(readme)) {
    throw new Error('Benchmark badge markers not found in README.md');
  }

  const updated = readme.replace(blockRegex, nextBlock);
  await writeFile(readmePath, updated, 'utf8');

  console.log('README benchmark badges updated.');
  console.log(metrics);
}

main().catch((error) => {
  console.error('Failed to update README benchmark badges:', error.message);
  process.exit(1);
});
