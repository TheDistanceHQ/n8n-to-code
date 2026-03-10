/**
 * Inline code generator for the NoOp node (n8n-nodes-base.noOp).
 * Simple pass-through.
 */

import type { ParsedNode } from '../../parser.js';
import { sanitizeNodeName } from '../../expression.js';

export function generateNoOpNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;

  return `
/**
 * No Operation: ${node.name}
 * Pass-through -- data flows unchanged.
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  return [items];
}`;
}
