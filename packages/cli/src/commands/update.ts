/**
 * CLI update command: incrementally updates a previously compiled project
 * when the source workflow changes.
 */

import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { join, resolve } from 'path';
import { compile, diffWorkflow, applyUpdates } from '@n8n-to-code/compiler';
import type { N8nWorkflow } from '@n8n-to-code/types';
import type { MetaFile } from '@n8n-to-code/compiler/dist/reparse/differ.js';

export interface UpdateOptions {
  dir: string;
}

export async function updateCommand(
  workflowFile: string,
  options: UpdateOptions,
): Promise<void> {
  const startTime = Date.now();
  const projectDir = resolve(options.dir);

  // Read new workflow
  console.log(`Reading updated workflow from: ${workflowFile}`);
  const content = await readFile(resolve(workflowFile), 'utf-8');
  let workflow: N8nWorkflow;

  try {
    workflow = JSON.parse(content) as N8nWorkflow;
  } catch (e) {
    console.error(`Failed to parse workflow JSON: ${(e as Error).message}`);
    process.exit(1);
  }

  // Read existing meta
  let meta: MetaFile;
  try {
    const metaContent = await readFile(join(projectDir, '__meta__.json'), 'utf-8');
    meta = JSON.parse(metaContent) as MetaFile;
  } catch (e) {
    console.error(`No __meta__.json found in ${projectDir}. Run 'compile' first.`);
    process.exit(1);
  }

  // Compute diff
  console.log('\nComputing diff...');
  const diff = diffWorkflow(workflow, meta);

  console.log(`  Added nodes: ${diff.added.length > 0 ? diff.added.join(', ') : 'none'}`);
  console.log(`  Removed nodes: ${diff.removed.length > 0 ? diff.removed.join(', ') : 'none'}`);
  console.log(`  Changed nodes: ${diff.changed.length > 0 ? diff.changed.join(', ') : 'none'}`);
  console.log(`  Unchanged nodes: ${diff.unchanged.length}`);
  console.log(`  Connections changed: ${diff.connectionsChanged}`);

  const updates = applyUpdates(diff);

  if (
    updates.regenerateNodes.length === 0 &&
    updates.deleteNodes.length === 0 &&
    !updates.regenerateWorkflow
  ) {
    console.log('\nNo changes detected. Project is up to date.');
    return;
  }

  // Full recompile (for now -- incremental node-level updates can be added later)
  console.log('\nRecompiling workflow...');
  const project = compile(workflow, {
    parallel: meta.parallel,
    monorepoRoot: resolve(projectDir, '..'),
    outputDir: projectDir,
  });

  let fileCount = 0;
  for (const [relativePath, fileContent] of project.files) {
    const fullPath = join(projectDir, relativePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, fileContent, 'utf-8');
    fileCount++;
  }

  const elapsed = Date.now() - startTime;
  console.log(`\nUpdated ${fileCount} files in ${elapsed}ms.`);
  console.log(`  Nodes regenerated: ${updates.regenerateNodes.length}`);
  console.log(`  Nodes removed: ${updates.deleteNodes.length}`);
}
