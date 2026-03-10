/**
 * @n8n-to-code/compiler
 *
 * Main compiler module. Takes n8n workflow JSON and produces
 * a standalone TypeScript project.
 */

export { parseWorkflow } from './parser.js';
export type { ParsedWorkflow, ParsedNode, Edge } from './parser.js';

export { buildGraph } from './graph.js';
export type { WorkflowGraph, ExecutionLevel, AdjacencyEntry } from './graph.js';

export { compileExpression, isExpression, sanitizeNodeName } from './expression.js';

export { generateWorkflowCode } from './codegen/workflow.js';
export type { GeneratedWorkflow } from './codegen/workflow.js';

export { generateProject } from './codegen/project.js';
export type { ProjectFiles, GenerateProjectOptions } from './codegen/project.js';

export { diffWorkflow, applyUpdates } from './reparse/differ.js';
export type { WorkflowDiff } from './reparse/differ.js';

import type { N8nWorkflow } from '@n8n-to-code/types';
import { parseWorkflow } from './parser.js';
import { buildGraph } from './graph.js';
import { generateWorkflowCode } from './codegen/workflow.js';
import { generateProject } from './codegen/project.js';
import type { ProjectFiles } from './codegen/project.js';

export interface CompileOptions {
  parallel?: boolean;
  outputDir?: string;
  /** Absolute path to the n8n-to-code monorepo root */
  monorepoRoot?: string;
}

/**
 * Compile an n8n workflow JSON into a standalone TypeScript project.
 * This is the main entry point for the compiler.
 */
export function compile(
  workflow: N8nWorkflow,
  options: CompileOptions = {},
): ProjectFiles {
  // Phase 1: Parse
  const parsed = parseWorkflow(workflow);

  // Phase 2: Build graph
  const graph = buildGraph(parsed);

  // Phase 3: Generate code
  const generated = generateWorkflowCode(parsed, graph, {
    parallel: options.parallel ?? true,
  });

  // Phase 4: Generate project
  const project = generateProject(parsed, generated, {
    workflowName: parsed.name,
    workflowId: parsed.id,
    parallel: options.parallel ?? true,
    monorepoRoot: options.monorepoRoot,
    outputDir: options.outputDir,
  });

  return project;
}
