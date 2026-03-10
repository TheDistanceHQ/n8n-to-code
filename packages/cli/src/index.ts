#!/usr/bin/env node
/**
 * n8n-to-code CLI
 * Compiles n8n workflow JSON into standalone TypeScript projects.
 */

import { Command } from 'commander';
import { compileCommand } from './commands/compile.js';
import { updateCommand } from './commands/update.js';

const program = new Command();

program
  .name('n8n-to-code')
  .description('Convert n8n workflows to compiled TypeScript')
  .version('0.1.0');

program
  .command('compile')
  .description('Compile an n8n workflow JSON file into a TypeScript project')
  .argument('<workflow-file>', 'Path to n8n workflow JSON file')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('--parallel', 'Enable parallel execution (default: true)', true)
  .option('--no-parallel', 'Disable parallel execution')
  .action(async (workflowFile: string, options: { output: string; parallel: boolean }) => {
    await compileCommand(workflowFile, options);
  });

program
  .command('update')
  .description('Update a previously compiled project with a new workflow version')
  .argument('<workflow-file>', 'Path to updated n8n workflow JSON file')
  .option('-d, --dir <dir>', 'Directory of the compiled project', './output')
  .action(async (workflowFile: string, options: { dir: string }) => {
    await updateCommand(workflowFile, options);
  });

program.parse();
