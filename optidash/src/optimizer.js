import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import chalk from 'chalk';
import cliProgress from 'cli-progress';

const SCAN_EXTS = new Set(['.js', '.css']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

async function getFilesRecursive(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...(await getFilesRecursive(fullPath)));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (SCAN_EXTS.has(ext)) {
      files.push(fullPath);
    }
  }

  return files;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getImportedNames(importLine) {
  const line = importLine.trim();
  if (!line.startsWith('import')) {
    return [];
  }

  if (/^import\s+['"].+['"];?$/.test(line)) {
    return [];
  }

  const names = [];

  const defaultMatch = line.match(/^import\s+([A-Za-z_$][\w$]*)\s*(,|from)/);
  if (defaultMatch) {
    names.push(defaultMatch[1]);
  }

  const namespaceMatch = line.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (namespaceMatch) {
    names.push(namespaceMatch[1]);
  }

  const namedBlock = line.match(/\{([^}]+)\}/);
  if (namedBlock) {
    const parts = namedBlock[1].split(',').map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const alias = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      names.push(alias ? alias[2] : part);
    }
  }

  return names;
}

function removeUnusedImportLines(source) {
  const lines = source.split(/\r?\n/);
  const kept = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed.startsWith('import')) {
      kept.push(line);
      continue;
    }

    const importedNames = getImportedNames(trimmed);
    if (importedNames.length === 0) {
      kept.push(line);
      continue;
    }

    const restOfFile = lines.slice(i + 1).join('\n');
    const allUnused = importedNames.every((name) => {
      const regex = new RegExp(`\\b${escapeRegex(name)}\\b`, 'm');
      return !regex.test(restOfFile);
    });

    if (!allUnused) {
      kept.push(line);
    }
  }

  return kept.join('\n');
}

function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

export default async function optimizeProject(dirPath) {
  const startedAt = Date.now();
  const root = path.resolve(dirPath);
  const distDir = path.join(root, 'dist');
  const tempDir = path.join(distDir, '.tmp-js');

  await mkdir(distDir, { recursive: true });
  await mkdir(tempDir, { recursive: true });

  const files = await getFilesRecursive(root);
  const jsFiles = files.filter((f) => path.extname(f).toLowerCase() === '.js');
  const cssFiles = files.filter((f) => path.extname(f).toLowerCase() === '.css');

  let originalSize = 0;
  for (const file of files) {
    originalSize += (await stat(file)).size;
  }

  const progress = new cliProgress.SingleBar(
    {
      format: `${chalk.cyan('Optimizing')} |{bar}| {percentage}% | {value}/{total} files`,
      hideCursor: true
    },
    cliProgress.Presets.shades_classic
  );

  const totalSteps = Math.max(1, jsFiles.length + cssFiles.length);
  progress.start(totalSteps, 0);

  for (const file of jsFiles) {
    const source = await readFile(file, 'utf8');
    const cleaned = removeUnusedImportLines(source);
    const relative = path.relative(root, file);
    const output = path.join(tempDir, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, cleaned, 'utf8');
    progress.increment();
  }

  let cssOptimizedSize = 0;
  for (const file of cssFiles) {
    const source = await readFile(file, 'utf8');
    const cleaned = minifyCss(source);
    const relative = path.relative(root, file);
    const output = path.join(distDir, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, cleaned, 'utf8');
    cssOptimizedSize += Buffer.byteLength(cleaned, 'utf8');
    progress.increment();
  }

  const tempEntry = path.join(tempDir, '__entry__.js');
  const imports = jsFiles
    .map((file) => path.relative(root, file).replace(/\\/g, '/'))
    .sort()
    .map((rel) => `import './${rel}';`)
    .join('\n');
  await writeFile(tempEntry, `${imports}\n`, 'utf8');

  const bundlePath = path.join(distDir, 'bundle.js');
  await build({
    entryPoints: [tempEntry],
    outfile: bundlePath,
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent'
  });

  progress.stop();

  const bundleInfo = await stat(bundlePath);
  const optimizedSize = bundleInfo.size + cssOptimizedSize;

  const gzipPath = path.join(distDir, 'bundle.js.gz');
  await pipeline(createReadStream(bundlePath), createGzip(), createWriteStream(gzipPath));
  const gzipInfo = await stat(gzipPath);

  const reductionPercent = originalSize > 0
    ? Math.round(((originalSize - optimizedSize) / originalSize) * 100)
    : 0;

  const result = {
    originalSize,
    optimizedSize,
    gzipSize: gzipInfo.size,
    reductionPercent,
    timeTaken: Date.now() - startedAt
  };

  console.log(chalk.cyan.bold('\nOptiDash Optimization Summary'));
  console.table([
    { Metric: chalk.white('Original Size (bytes)'), Value: chalk.yellow(String(result.originalSize)) },
    { Metric: chalk.white('Optimized Size (bytes)'), Value: chalk.yellow(String(result.optimizedSize)) },
    { Metric: chalk.white('Gzip Size (KB)'), Value: chalk.yellow((result.gzipSize / 1024).toFixed(2)) },
    { Metric: chalk.green('Savings (%)'), Value: chalk.green(`${result.reductionPercent}%`) },
    { Metric: chalk.white('Time Taken (ms)'), Value: chalk.yellow(String(result.timeTaken)) }
  ]);

  return result;
}
