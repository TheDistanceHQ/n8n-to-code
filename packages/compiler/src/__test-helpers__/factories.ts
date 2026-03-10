/**
 * Test helpers: factory functions and fixture loader for compiler tests.
 */
import type { ParsedNode, ParsedWorkflow, Edge } from '../parser.js';
import type { N8nWorkflow, N8nNode } from '@n8n-to-code/types';
import { readFileSync } from 'fs';
import { join } from 'path';

const FIXTURES_DIR = join(__dirname, '../../__fixtures__');

export function makeParsedNode(overrides: Partial<ParsedNode> = {}): ParsedNode {
  return {
    id: 'test-node-id',
    name: 'Test Node',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    parameters: {},
    credentials: {},
    disabled: false,
    compilationMode: 'inline',
    ...overrides,
  };
}

export function makeWorkflow(overrides: Partial<N8nWorkflow> = {}): N8nWorkflow {
  return {
    id: 'test-workflow-id',
    name: 'Test Workflow',
    active: false,
    nodes: [],
    connections: {},
    ...overrides,
  };
}

export function makeN8nNode(overrides: Partial<N8nNode> = {}): N8nNode {
  return {
    id: 'test-node-id',
    name: 'Test Node',
    type: 'n8n-nodes-base.set',
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...overrides,
  };
}

export function loadFixture(name: string): unknown {
  const path = name.endsWith('.json') ? join(FIXTURES_DIR, name) : join(FIXTURES_DIR, `${name}.json`);
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}

/** Load the repo root test workflow (same file used by test-compile.mjs). */
export function loadTestWorkflow(): unknown {
  const path = join(__dirname, '../../../../test-workflow.json');
  const content = readFileSync(path, 'utf-8');
  return JSON.parse(content);
}
