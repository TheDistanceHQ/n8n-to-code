/**
 * CLI compile command: takes an n8n workflow JSON file and generates
 * a standalone TypeScript project.
 */

import { readFile, mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { compile } from '@n8n-to-code/compiler';
import type { N8nWorkflow } from '@n8n-to-code/types';

export interface CompileOptions {
  output: string;
  parallel: boolean;
}

export async function compileCommand(
  workflowFile: string,
  options: CompileOptions,
): Promise<void> {
  const startTime = Date.now();

  // Read workflow JSON
  console.log(`Reading workflow from: ${workflowFile}`);
  const content = await readFile(resolve(workflowFile), 'utf-8');
  let workflow: N8nWorkflow;

  try {
    workflow = JSON.parse(content) as N8nWorkflow;
  } catch (e) {
    console.error(`Failed to parse workflow JSON: ${(e as Error).message}`);
    process.exit(1);
  }

  console.log(`Workflow: ${workflow.name}`);
  console.log(`Nodes: ${workflow.nodes.length}`);
  console.log(`Parallel execution: ${options.parallel}`);

  const outputDir = resolve(options.output);

  // Compile (pass monorepoRoot/outputDir so generated package.json uses correct file: paths)
  console.log('\nCompiling...');
  const project = compile(workflow, {
    parallel: options.parallel,
    monorepoRoot: process.cwd(),
    outputDir,
  });
  console.log(`\nWriting to: ${outputDir}`);

  let fileCount = 0;
  for (const [relativePath, content] of project.files) {
    const fullPath = join(outputDir, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, content, 'utf-8');
    fileCount++;
    console.log(`  ${relativePath}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(`\nDone! Generated ${fileCount} files in ${elapsed}ms.`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${options.output}`);
  console.log(`  npm install`);
  console.log(`  npm run build`);
  console.log(`  npm start`);
}
