import path from 'node:path';
import { promises as fs } from 'node:fs';

function toKB(bytes) {
  return Number((bytes / 1024).toFixed(2));
}

const ANALYZED_EXTENSIONS = new Set(['.js', '.ts', '.css', '.html']);

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectDuplicateDependencies(baseDir) {
  const packageJsonPath = path.join(baseDir, 'package.json');
  const exists = await fileExists(packageJsonPath);

  if (!exists) {
    return [];
  }

  const packageRaw = await fs.readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageRaw);

  const dependencySections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies'
  ];

  const packageIndex = new Map();

  for (const section of dependencySections) {
    const deps = packageJson[section] || {};

    for (const [name, version] of Object.entries(deps)) {
      if (!packageIndex.has(name)) {
        packageIndex.set(name, []);
      }

      packageIndex.get(name).push({ section, version });
    }
  }

  return [...packageIndex.entries()]
    .filter(([, refs]) => refs.length > 1)
    .map(([name, refs]) => {
      const sections = refs.map((entry) => entry.section).join(', ');
      const versions = [...new Set(refs.map((entry) => entry.version))].join(', ');

      return {
        name,
        sections,
        versions
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function analyzeProject(dirPath = '.') {
  const rootDir = path.resolve(dirPath);
  const startedAt = process.hrtime.bigint();
  const memoryBefore = process.memoryUsage();

  const exists = await fileExists(rootDir);
  if (!exists) {
    throw new Error(`Directory not found: ${rootDir}`);
  }

  const rootStats = await fs.stat(rootDir);
  if (!rootStats.isDirectory()) {
    throw new Error(`Expected a directory path: ${rootDir}`);
  }

  const scannedFiles = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!ANALYZED_EXTENSIONS.has(ext)) {
        continue;
      }

      const fileStats = await fs.stat(fullPath);
      scannedFiles.push({
        path: fullPath,
        sizeBytes: fileStats.size,
        sizeKB: toKB(fileStats.size)
      });
    }
  }

  await walk(rootDir);

  const totalSize = scannedFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
  const largestFiles = [...scannedFiles]
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 5);
  const duplicateDependencies = await collectDuplicateDependencies(rootDir);

  const endedAt = process.hrtime.bigint();
  const memoryAfter = process.memoryUsage();
  const executionTimeMs = Number(endedAt - startedAt) / 1_000_000;
  const memoryUsed = {
    heapUsedBytes: Math.max(0, memoryAfter.heapUsed - memoryBefore.heapUsed),
    rssBytes: Math.max(0, memoryAfter.rss - memoryBefore.rss)
  };

  const result = {
    dirPath: rootDir,
    totalSize,
    fileCount: scannedFiles.length,
    largestFiles,
    duplicateDependencies,
    executionTimeMs: Number(executionTimeMs.toFixed(2)),
    memoryUsed,
    scannedFiles
  };

  console.table([
    {
      directory: result.dirPath,
      fileCount: result.fileCount,
      totalSizeBytes: result.totalSize,
      executionTimeMs: result.executionTimeMs,
      heapUsedBytes: result.memoryUsed.heapUsedBytes,
      rssBytes: result.memoryUsed.rssBytes
    }
  ]);

  if (result.largestFiles.length > 0) {
    console.table(
      result.largestFiles.map((file) => ({
        file: file.path,
        sizeBytes: file.sizeBytes,
        sizeKB: file.sizeKB
      }))
    );
  }

  if (result.duplicateDependencies.length > 0) {
    console.table(result.duplicateDependencies);
  }

  return result;
}

export async function analyzeTarget(targetPath = '.') {
  const absoluteTarget = path.resolve(targetPath);
  const stats = await fs.stat(absoluteTarget);

  if (stats.isFile()) {
    return {
      target: absoluteTarget,
      type: 'file',
      fileCount: 1,
      totalBytes: stats.size,
      totalKB: toKB(stats.size),
      files: [{ path: absoluteTarget, bytes: stats.size, kb: toKB(stats.size) }]
    };
  }

  const projectAnalysis = await analyzeProject(absoluteTarget);

  return {
    target: absoluteTarget,
    type: 'directory',
    fileCount: projectAnalysis.fileCount,
    totalBytes: projectAnalysis.totalSize,
    totalKB: toKB(projectAnalysis.totalSize),
    files: projectAnalysis.scannedFiles.map((file) => ({
      path: file.path,
      bytes: file.sizeBytes,
      kb: file.sizeKB
    }))
  };
}
