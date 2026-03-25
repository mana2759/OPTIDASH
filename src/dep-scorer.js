import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Known package groups for redundancy detection
 * Maps package to group of similar packages
 */
const REDUNDANCY_GROUPS = {
  // Functional utilities
  lodash: ['lodash', 'underscore', 'ramda', 'fp-ts', 'sanctuary'],
  underscore: ['lodash', 'underscore', 'ramda', 'fp-ts', 'sanctuary'],
  ramda: ['lodash', 'underscore', 'ramda', 'fp-ts', 'sanctuary'],

  // Date/Time libraries
  'moment': ['moment', 'date-fns', 'dayjs', 'luxon', 'temporal-polyfill'],
  'date-fns': ['moment', 'date-fns', 'dayjs', 'luxon', 'temporal-polyfill'],
  'dayjs': ['moment', 'date-fns', 'dayjs', 'luxon', 'temporal-polyfill'],

  // HTTP clients
  'axios': ['axios', 'node-fetch', 'request', 'got', 'undici'],
  'node-fetch': ['axios', 'node-fetch', 'request', 'got', 'undici'],
  'request': ['axios', 'node-fetch', 'request', 'got', 'undici'],
  'got': ['axios', 'node-fetch', 'request', 'got', 'undici'],

  // Testing frameworks
  'jest': ['jest', 'mocha', 'vitest', 'jasmine'],
  'mocha': ['jest', 'mocha', 'vitest', 'jasmine'],
  'vitest': ['jest', 'mocha', 'vitest', 'jasmine'],

  // Assertion libraries
  'chai': ['chai', 'assert', 'expect.js'],
  'expect.js': ['chai', 'assert', 'expect.js'],

  // React utilities
  'react-router': ['react-router', 'react-router-dom', 'next/router', 'tanstack/react-router'],
  'react-router-dom': ['react-router', 'react-router-dom', 'next/router', 'tanstack/react-router'],

  // State management
  'redux': ['redux', 'zustand', 'jotai', 'recoil', 'mobx'],
  'zustand': ['redux', 'zustand', 'jotai', 'recoil', 'mobx'],
  'jotai': ['redux', 'zustand', 'jotai', 'recoil', 'mobx'],
  'recoil': ['redux', 'zustand', 'jotai', 'recoil', 'mobx'],
  'mobx': ['redux', 'zustand', 'jotai', 'recoil', 'mobx'],

  // CSS-in-JS
  'styled-components': ['styled-components', 'emotion', 'css-in-js'],
  'emotion': ['styled-components', 'emotion', 'css-in-js'],

  // Validation
  'joi': ['joi', 'yup', 'zod', 'io-ts', 'valibot'],
  'yup': ['joi', 'yup', 'zod', 'io-ts', 'valibot'],
  'zod': ['joi', 'yup', 'zod', 'io-ts', 'valibot'],

  // Logging
  'winston': ['winston', 'pino', 'bunyan', 'loglevel'],
  'pino': ['winston', 'pino', 'bunyan', 'loglevel']
};

/**
 * Get all dependencies from package.json
 */
function readDependencies(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`package.json not found at ${pkgPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
    ...pkg.peerDependencies
  };

  return Object.keys(deps);
}

/**
 * Get the size of a package in node_modules
 */
function getPackageSize(projectPath, packageName) {
  const pkgPath = path.join(projectPath, 'node_modules', packageName);

  if (!fs.existsSync(pkgPath)) {
    return 0;
  }

  function getDirSize(dir) {
    let size = 0;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          size += getDirSize(filePath);
        } else {
          size += stat.size;
        }
      }
    } catch {
      return 0;
    }
    return size;
  }

  return getDirSize(pkgPath);
}

/**
 * Score package size (0-10)
 * >1MB = 0, <10KB = 10, linear scale
 */
function scoreSizeScore(sizeBytes) {
  const KB = 1024;
  const MB = 1024 * KB;

  const sizeKB = sizeBytes / KB;

  if (sizeKB > 1024) {
    // >1MB = 0
    return 0;
  }

  if (sizeKB < 10) {
    // <10KB = 10
    return 10;
  }

  // Linear scale: 10KB = 10, 1MB = 0
  // 1000KB difference for 10 points
  const score = 10 - ((sizeKB - 10) / (1024 - 10)) * 10;
  return Math.max(0, Math.round(score * 10) / 10);
}

/**
 * Score redundancy (0-10)
 * Checks if there are other packages in the project doing similar things
 */
function scoreRedundancy(projectPath, packageName, allDeps) {
  const group = REDUNDANCY_GROUPS[packageName];

  if (!group) {
    // Not in any redundancy group = no redundancy concerns
    return 10;
  }

  // Count how many packages from the same group are installed
  const installedInGroup = group.filter((pkg) => allDeps.includes(pkg));

  if (installedInGroup.length === 1) {
    // Only this package from the group
    return 10;
  }

  if (installedInGroup.length === 2) {
    // 2 packages from group = moderate redundancy
    return 5;
  }

  // 3+ packages from group = high redundancy
  return 0;
}

/**
 * Check if package is tree-shakable (0-10)
 */
function scoreTreeshakability(projectPath, packageName) {
  const pkgJsonPath = path.join(projectPath, 'node_modules', packageName, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    return 0;
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

    // Check for ES module entry point
    if (pkg.module || pkg.exports) {
      // Check for sideEffects: false
      if (pkg.sideEffects === false) {
        return 10;
      }
      // Has module field but may have side effects
      return 7;
    }

    // Check if it's an ESM-only package
    if (pkg.type === 'module') {
      return 8;
    }

    // CommonJS only
    return 2;
  } catch {
    return 0;
  }
}

/**
 * Get optimization suggestions for a package
 */
function getSuggestions(packageName, sizeBytes, sizeScore, redundantPackages) {
  const suggestions = [];
  const sizeKB = sizeBytes / 1024;

  // Size suggestions
  if (sizeKB > 500) {
    // Find alternative smaller packages
    const alternatives = {
      'moment': 'date-fns (13KB tree-shakable)',
      'lodash': 'lodash-es or individual modules',
      'axios': 'node-fetch (modern alternative)',
      'request': 'got or node-fetch (modern alternatives)',
      'redux': 'zustand (2.5KB alternative)'
    };

    if (alternatives[packageName]) {
      suggestions.push(`Replace ${packageName} (${sizeKB.toFixed(0)}KB) with ${alternatives[packageName]}`);
    } else if (sizeKB > 1000) {
      suggestions.push(`${packageName} is very large (${sizeKB.toFixed(0)}KB), consider alternatives`);
    }
  }

  // Redundancy suggestions
  if (redundantPackages.length > 0) {
    suggestions.push(`Found redundant packages: ${redundantPackages.join(', ')}`);
  }

  // Tree-shaking suggestions
  if (sizeScore < 7) {
    const alternatives = {
      'moment': 'date-fns',
      'lodash': 'lodash-es',
      'axios': 'isomorphic-fetch'
    };

    if (alternatives[packageName]) {
      suggestions.push(`${alternatives[packageName]} is tree-shakable - consider switching`);
    }
  }

  return suggestions;
}

/**
 * Main scoring function
 */
export async function scoreDependencies(projectPath) {
  const allDeps = readDependencies(projectPath);

  const packageScores = [];
  let totalScore = 0;

  for (const pkg of allDeps) {
    const sizeBytes = getPackageSize(projectPath, pkg);
    const sizeScore = scoreSizeScore(sizeBytes);
    const redundancyScore = scoreRedundancy(projectPath, pkg, allDeps);
    const treeshakeScore = scoreTreeshakability(projectPath, pkg);

    // Calculate composite score (equal weighting)
    const compositeScore = Math.round((sizeScore + redundancyScore + treeshakeScore) / 3 * 10) / 10;

    // Find redundant packages
    const group = REDUNDANCY_GROUPS[pkg];
    const redundantPackages = group
      ? group.filter((p) => p !== pkg && allDeps.includes(p))
      : [];

    const suggestions = getSuggestions(pkg, sizeBytes, sizeScore, redundantPackages);

    packageScores.push({
      name: pkg,
      sizeBytes,
      sizeKB: (sizeBytes / 1024).toFixed(2),
      sizeScore,
      redundancyScore,
      treeshakeScore,
      compositeScore,
      suggestions
    });

    totalScore += compositeScore;
  }

  // Calculate overall health score
  const healthScore = allDeps.length > 0 ? Math.round((totalScore / allDeps.length) * 10) / 10 : 0;

  // Sort by composite score
  packageScores.sort((a, b) => a.compositeScore - b.compositeScore);

  return {
    projectPath,
    totalDependencies: allDeps.length,
    healthScore,
    packages: packageScores
  };
}

/**
 * Format and print results
 */
export async function printDependencyReport(projectPath) {
  try {
    const result = await scoreDependencies(projectPath);

    console.log('\n📦 Dependency Health Analysis\n');
    console.log(`📍 Project: ${result.projectPath}`);
    console.log(`📊 Overall Health Score: ${result.healthScore}/10`);
    console.log(`📦 Total Dependencies: ${result.totalDependencies}\n`);

    // Print table
    console.log('Package Scores by Composite Score:');
    console.table(
      result.packages.map((pkg) => ({
        Package: pkg.name,
        'Size (KB)': pkg.sizeKB,
        'Size Score': pkg.sizeScore,
        'Redundancy': pkg.redundancyScore,
        'Tree-shake': pkg.treeshakeScore,
        'Overall Score': pkg.compositeScore
      }))
    );

    // Print suggestions for low-scoring packages
    const lowScoring = result.packages.filter((pkg) => pkg.compositeScore < 6);

    if (lowScoring.length > 0) {
      console.log('\n💡 Top Optimization Opportunities:\n');
      lowScoring.slice(0, 10).forEach((pkg) => {
        console.log(`  ❌ ${pkg.name} (Score: ${pkg.compositeScore}/10)`);
        pkg.suggestions.forEach((s) => {
          console.log(`     → ${s}`);
        });
      });
    }

    // Summary statistics
    const avgScore = (result.packages.reduce((acc, p) => acc + p.compositeScore, 0) / result.packages.length).toFixed(2);
    const largestPkg = result.packages.reduce((a, b) => a.sizeBytes > b.sizeBytes ? a : b);
    const redundantGroups = {};

    for (const pkg of result.packages) {
      const group = REDUNDANCY_GROUPS[pkg.name];
      if (group) {
        const installedInGroup = group.filter((p) => result.packages.some((installed) => installed.name === p));
        if (installedInGroup.length > 1) {
          redundantGroups[group.join(' | ')] = installedInGroup;
        }
      }
    }

    console.log('\n📈 Summary Statistics:');
    console.log(`  • Average Score: ${avgScore}/10`);
    console.log(`  • Largest Package: ${largestPkg.name} (${largestPkg.sizeKB} KB)`);
    console.log(`  • Redundant Groups Found: ${Object.keys(redundantGroups).length}`);

    return result;
  } catch (error) {
    console.error('❌ Error analyzing dependencies:', error.message);
    throw error;
  }
}
