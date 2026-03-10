/**
 * Test script: compiles the LinkedIn enrichment workflow
 * and writes the output to ./test-output/
 */

import { compile } from './packages/compiler/dist/index.js';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

// The workflow JSON (fetched from n8n instance)
const workflowJson = readFileSync('./test-workflow.json', 'utf-8');
const workflow = JSON.parse(workflowJson);

console.log(`Compiling workflow: ${workflow.name}`);
console.log(`Nodes: ${workflow.nodes.length}`);

const project = compile(workflow, { parallel: true });

// Write output
const outputDir = './test-output';
for (const [relativePath, content] of project.files) {
  const fullPath = join(outputDir, relativePath);
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  console.log(`  Written: ${relativePath}`);
}

console.log('\nDone! Check ./test-output/');
