import path from 'node:path';
import fs from 'fs-extra';
import chalk from 'chalk';

export async function reportAnalysis(analysis, outputPath = 'web/report.json') {
  const resolvedOutput = path.resolve(outputPath);
  await fs.ensureDir(path.dirname(resolvedOutput));
  await fs.writeJson(resolvedOutput, analysis, { spaces: 2 });

  console.log(chalk.cyan('\nAnalysis Complete'));
  console.log(chalk.gray(`Target: ${analysis.target}`));
  console.log(chalk.gray(`Files: ${analysis.fileCount}`));
  console.log(chalk.gray(`Total size: ${analysis.totalKB} KB`));
  console.log(chalk.green(`Report saved to: ${resolvedOutput}\n`));

  return resolvedOutput;
}

export function reportOptimization(result) {
  console.log(chalk.cyan('\nOptimization Complete'));
  console.log(chalk.gray(`Entry: ${result.entryPoint}`));
  console.log(chalk.gray(`Output dir: ${result.outdir}`));

  if (result.outputs.length > 0) {
    console.log(chalk.green('Generated files:'));
    result.outputs.forEach((file) => {
      console.log(chalk.gray(`- ${file}`));
    });
  }

  console.log();
}
