/**
 * Inline code generator for the Code node (n8n-nodes-base.code).
 * Extracts inline JavaScript and wraps it with proper bindings.
 */

import type { ParsedNode } from '../../parser.js';
import { sanitizeNodeName } from '../../expression.js';

export function generateCodeNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;
  const language = (node.parameters.language as string) ?? 'javaScript';
  const mode = (node.parameters.mode as string) ?? 'runOnceForAllItems';

  if (language === 'python') {
    return generatePythonStub(fnName, node);
  }

  const jsCode = (node.parameters.jsCode as string) ?? '';

  if (mode === 'runOnceForAllItems') {
    return generateRunOnceForAll(fnName, node, jsCode);
  }

  return generateRunOnceForEach(fnName, node, jsCode);
}

function generateRunOnceForAll(fnName: string, node: ParsedNode, jsCode: string): string {
  // Escape the code for embedding
  const escapedCode = jsCode.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  return `
/**
 * Code (Run Once for All Items): ${node.name}
 * Compiled from n8n-nodes-base.code v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  // Bind $input helpers
  const $input = {
    all: () => items,
    first: () => items[0],
    last: () => items[items.length - 1],
    item: items[0],
  };

  // Execute the user's code
  const $items = items;
  const executeCode = async () => {
${indentCode(jsCode, 4)}
  };

  const result = await executeCode();

  // Normalize return value
  if (Array.isArray(result)) {
    return [result.map((item: unknown) => {
      if (typeof item === 'object' && item !== null && 'json' in item) {
        return item as DataItem;
      }
      return { json: item as Record<string, unknown> };
    })];
  }

  return [items];
}`;
}

function generateRunOnceForEach(fnName: string, node: ParsedNode, jsCode: string): string {
  return `
/**
 * Code (Run Once for Each Item): ${node.name}
 * Compiled from n8n-nodes-base.code v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const output: DataItem[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const $json = item.json;
    const $input = {
      all: () => items,
      first: () => items[0],
      last: () => items[items.length - 1],
      item,
    };

    const executeCode = async () => {
${indentCode(jsCode, 6)}
    };

    const result = await executeCode();

    if (typeof result === 'object' && result !== null && 'json' in result) {
      output.push(result as DataItem);
    } else if (result !== undefined) {
      output.push({ json: result as Record<string, unknown>, pairedItem: { item: itemIndex } });
    } else {
      output.push(item);
    }
  }

  return [output];
}`;
}

function generatePythonStub(fnName: string, node: ParsedNode): string {
  return `
/**
 * Code (Python): ${node.name}
 * Python code nodes are not yet supported for inline compilation.
 * TODO: Phase 2 -- either transpile or shell out to Python
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  throw new Error('Python Code nodes are not yet supported. Node: ${node.name}');
}`;
}

function indentCode(code: string, spaces: number): string {
  const indent = ' '.repeat(spaces);
  return code
    .split('\n')
    .map((line) => indent + line)
    .join('\n');
}
