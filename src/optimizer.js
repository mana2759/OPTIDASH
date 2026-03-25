import path from 'node:path';
import fs from 'fs-extra';
import { build } from 'esbuild';
import { transform } from 'esbuild';
import { gzip as gzipCallback } from 'node:zlib';
import { promisify } from 'node:util';
import cliProgress from 'cli-progress';

const gzip = promisify(gzipCallback);

async function getDirectorySize(dirPath) {
  if (!(await fs.pathExists(dirPath))) {
    return 0;
  }

  let total = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySize(fullPath);
      continue;
    }

    if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      total += stat.size;
    }
  }

  return total;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function escapeRegex(input) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compressCss(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

function parseImportClause(clause) {
  const parsed = {
    defaultImport: null,
    namespaceImport: null,
    namedImports: []
  };

  const namedMatch = clause.match(/\{([\s\S]*?)\}/);
  if (namedMatch) {
    const rawNamed = namedMatch[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    parsed.namedImports = rawNamed.map((part) => {
      const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (aliasMatch) {
        return { imported: aliasMatch[1], local: aliasMatch[2] };
      }

      return { imported: part, local: part };
    });
  }

  const withoutNamed = clause.replace(/\{[\s\S]*?\}/g, '').trim().replace(/,+$/, '').trim();
  if (withoutNamed) {
    const parts = withoutNamed
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    for (const part of parts) {
      const namespaceMatch = part.match(/^\*\s+as\s+([A-Za-z_$][\w$]*)$/);
      if (namespaceMatch) {
        parsed.namespaceImport = namespaceMatch[1];
      } else if (!parsed.defaultImport) {
        parsed.defaultImport = part;
      }
    }
  }

  return parsed;
}

function buildImportClause(parsed) {
  const named = parsed.namedImports.map((item) => {
    return item.imported === item.local ? item.imported : `${item.imported} as ${item.local}`;
  });

  if (parsed.namespaceImport) {
    return parsed.defaultImport
      ? `${parsed.defaultImport}, * as ${parsed.namespaceImport}`
      : `* as ${parsed.namespaceImport}`;
  }

  const parts = [];
  if (parsed.defaultImport) {
    parts.push(parsed.defaultImport);
  }
  if (named.length > 0) {
    parts.push(`{ ${named.join(', ')} }`);
  }

  return parts.join(', ');
}

function removeUnusedImports(content) {
  const importStatementRegex = /^\s*import\s+([\s\S]*?)\s+from\s+(['"][^'"]+['"])\s*;?\s*$/gm;
  const sideEffectImportRegex = /^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm;
  const contentWithoutSideEffects = content.replace(sideEffectImportRegex, '');
  const bodyWithoutImports = contentWithoutSideEffects.replace(importStatementRegex, '');

  return content.replace(importStatementRegex, (fullMatch, clause, source) => {
    const parsed = parseImportClause(clause.trim());
    const isUsed = (identifier) => {
      const matcher = new RegExp(`\\b${escapeRegex(identifier)}\\b`, 'm');
      return matcher.test(bodyWithoutImports);
    };

    parsed.defaultImport = parsed.defaultImport && isUsed(parsed.defaultImport) ? parsed.defaultImport : null;
    parsed.namespaceImport = parsed.namespaceImport && isUsed(parsed.namespaceImport) ? parsed.namespaceImport : null;
    parsed.namedImports = parsed.namedImports.filter((item) => isUsed(item.local));

    const rebuiltClause = buildImportClause(parsed);
    if (!rebuiltClause) {
      return '';
    }

    return `import ${rebuiltClause} from ${source};`;
  });
}

async function collectProjectFiles(rootDir) {
  const jsFiles = [];
  const cssFiles = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name.startsWith('.git')) {
          continue;
        }
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (extension === '.js') {
        jsFiles.push(fullPath);
      } else if (extension === '.css') {
        cssFiles.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return { jsFiles, cssFiles };
}

async function writeOptimizedFile(rootDir, distDir, sourceFile, outputContent) {
  const relativePath = path.relative(rootDir, sourceFile);
  const outputPath = path.join(distDir, relativePath);
  await fs.ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, outputContent, 'utf8');
  return outputPath;
}

export async function optimizeProject(dirPath = '.', options = {}) {
  const rootDir = path.resolve(dirPath);
  const distDir = path.resolve(options.distDir || path.join(rootDir, 'dist'));
  const startTime = process.hrtime.bigint();
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const showProgressBar = options.showProgressBar !== false;

  if (!(await fs.pathExists(rootDir))) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const { jsFiles, cssFiles } = await collectProjectFiles(rootDir);
  const totalFiles = jsFiles.length + cssFiles.length;
  let originalSize = 0;
  let optimizedSize = 0;
  let processedFiles = 0;

  await fs.emptyDir(distDir);

  const progressBar = showProgressBar
    ? new cliProgress.SingleBar(
        {
          format: 'Optimizing [{bar}] {percentage}% | {value}/{total} files',
          hideCursor: true
        },
        cliProgress.Presets.shades_classic
      )
    : null;

  if (progressBar) {
    progressBar.start(totalFiles || 1, 0);
  }

  if (onProgress) {
    onProgress({ processed: 0, total: totalFiles, progress: 0, status: 'starting' });
  }

  for (const filePath of jsFiles) {
    const originalContent = await fs.readFile(filePath, 'utf8');
    originalSize += Buffer.byteLength(originalContent);

    const withoutUnusedImports = removeUnusedImports(originalContent);
    const minified = await transform(withoutUnusedImports, {
      loader: 'js',
      minify: true,
      format: 'esm'
    });

    const outputPath = await writeOptimizedFile(rootDir, distDir, filePath, minified.code);
    const gzipped = await gzip(Buffer.from(minified.code, 'utf8'));
    await fs.writeFile(`${outputPath}.gz`, gzipped);
    optimizedSize += gzipped.byteLength;

    processedFiles += 1;
    if (progressBar) {
      progressBar.increment();
    }
    if (onProgress) {
      const progress = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 100;
      onProgress({ processed: processedFiles, total: totalFiles, progress, status: 'optimizing-js' });
    }
  }

  for (const filePath of cssFiles) {
    const originalContent = await fs.readFile(filePath, 'utf8');
    originalSize += Buffer.byteLength(originalContent);

    const compressedCss = compressCss(originalContent);
    const outputPath = await writeOptimizedFile(rootDir, distDir, filePath, compressedCss);
    const gzipped = await gzip(Buffer.from(compressedCss, 'utf8'));
    await fs.writeFile(`${outputPath}.gz`, gzipped);
    optimizedSize += gzipped.byteLength;

    processedFiles += 1;
    if (progressBar) {
      progressBar.increment();
    }
    if (onProgress) {
      const progress = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 100;
      onProgress({ processed: processedFiles, total: totalFiles, progress, status: 'optimizing-css' });
    }
  }

  if (progressBar) {
    progressBar.stop();
  }

  const reductionPercent = originalSize > 0 ? Number((((originalSize - optimizedSize) / originalSize) * 100).toFixed(2)) : 0;
  const bytesSaved = Math.max(0, originalSize - optimizedSize);
  const assumedTransferBytesPerSec = Number(options.transferBytesPerSec || 1_250_000);
  const timeSaved = Number((bytesSaved / assumedTransferBytesPerSec).toFixed(4));

  const stats = {
    originalSize,
    optimizedSize,
    reductionPercent,
    timeSaved
  };

  if (onProgress) {
    onProgress({ processed: totalFiles, total: totalFiles, progress: 100, status: 'complete' });
  }

  console.table([
    {
      originalSize,
      optimizedSize,
      reductionPercent: `${reductionPercent}%`,
      timeSavedSeconds: timeSaved,
      elapsedMs: Number((Number(process.hrtime.bigint() - startTime) / 1_000_000).toFixed(2))
    }
  ]);

  return stats;
}

export async function optimize(input = 'src/cli.js', outputDir = 'dist') {
  const entryPoint = path.resolve(input);
  const outdir = path.resolve(outputDir);

  const exists = await fs.pathExists(entryPoint);
  if (!exists) {
    throw new Error(`Entry file not found: ${entryPoint}`);
  }

  await fs.ensureDir(outdir);

  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    sourcemap: true,
    platform: 'node',
    format: 'esm',
    outdir,
    logLevel: 'silent',
    metafile: true
  });

  return {
    entryPoint,
    outdir,
    outputs: Object.keys(result.metafile?.outputs || {})
  };
}

export async function selfOptimize(projectPath = '.') {
  const rootDir = path.resolve(projectPath);
  const entryPoint = path.join(rootDir, 'src', 'cli.js');
  const distDir = path.join(rootDir, 'dist');
  const outputFile = path.join(distDir, 'optidash-self.js');
  const started = process.hrtime.bigint();

  if (!(await fs.pathExists(entryPoint))) {
    throw new Error(`CLI entry point not found: ${entryPoint}`);
  }

  await fs.ensureDir(distDir);

  const analysis = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    minify: true,
    metafile: true,
    write: false,
    logLevel: 'silent'
  });

  await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    minify: true,
    outfile: outputFile,
    banner: {
      js: '#!/usr/bin/env node'
    },
    logLevel: 'silent'
  });

  await fs.chmod(outputFile, 0o755);

  const bundledStat = await fs.stat(outputFile);
  const nodeModulesSize = await getDirectorySize(path.join(rootDir, 'node_modules'));
  const reductionPercent = nodeModulesSize > 0
    ? Number((((nodeModulesSize - bundledStat.size) / nodeModulesSize) * 100).toFixed(2))
    : 0;
  const elapsedMs = Number((Number(process.hrtime.bigint() - started) / 1_000_000).toFixed(2));

  const summary = {
    entryPoint,
    bundleOutput: outputFile,
    bundledSize: bundledStat.size,
    nodeModulesSize,
    reductionPercent,
    elapsedMs,
    bundledInputs: Object.keys(analysis.metafile?.inputs || {}).length
  };

  console.log('\n' + '='.repeat(72));
  console.log('WE OPTIMIZED THE OPTIMIZER!');
  console.log('='.repeat(72));
  console.log(`Bundled CLI:     ${formatBytes(summary.bundledSize)} (${summary.bundleOutput})`);
  console.log(`node_modules:    ${formatBytes(summary.nodeModulesSize)}`);
  console.log(`Difference:      ${formatBytes(Math.max(0, summary.nodeModulesSize - summary.bundledSize))}`);
  console.log(`Size reduction:  ${summary.reductionPercent}%`);
  console.log(`Bundle inputs:   ${summary.bundledInputs}`);
  console.log(`Build time:      ${summary.elapsedMs} ms`);
  console.log('='.repeat(72) + '\n');

  return summary;
}
