/**
 * Inline code generator for the Set/Edit Fields node (n8n-nodes-base.set).
 * Compiles field assignments to native TypeScript property operations.
 */

import type { ParsedNode } from '../../parser.js';
import { compileExpression, isExpression, sanitizeNodeName } from '../../expression.js';

export function generateSetNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;
  const mode = (node.parameters.mode as string) ?? 'manual';
  const duplicateItem = (node.parameters.duplicateItem as boolean) ?? false;

  if (mode === 'manual') {
    return generateManualMode(fnName, node, duplicateItem);
  }

  // Raw/JSON mode -- pass through with modifications
  return generateRawMode(fnName, node);
}

function generateManualMode(fnName: string, node: ParsedNode, duplicateItem: boolean): string {
  // v3.x uses "fields.values", v3.3+ uses "assignments.assignments"
  const assignmentsContainer = node.parameters.assignments as Record<string, unknown> | undefined;
  const fieldsContainer = node.parameters.fields as Record<string, unknown> | undefined;
  const assignments = (
    assignmentsContainer?.assignments ??
    fieldsContainer?.values ??
    []
  ) as Array<Record<string, unknown>>;

  const assignmentCode = assignments.map((assignment) => {
    const name = assignment.name as string;
    // v3.x uses stringValue/numberValue/booleanValue, v3.3+ uses value
    const value = assignment.value ?? assignment.stringValue ?? assignment.numberValue ?? assignment.booleanValue;
    const type = (assignment.type as string) ?? 'string';

    let valueCode: string;
    if (typeof value === 'string' && isExpression(value)) {
      valueCode = compileExpression(value);
    } else {
      valueCode = JSON.stringify(value);
    }

    // Type coercion
    switch (type) {
      case 'number':
        valueCode = `Number(${valueCode})`;
        break;
      case 'boolean':
        valueCode = `Boolean(${valueCode})`;
        break;
      case 'object':
        if (typeof value === 'string') {
          valueCode = `JSON.parse(${valueCode})`;
        }
        break;
    }

    return `    setNestedProperty(result.json, ${JSON.stringify(name)}, ${valueCode});`;
  });

  const includeOtherFields = (node.parameters.includeOtherFields !== false);
  const baseObj = includeOtherFields
    ? '{ ...item.json }'
    : '{}';

  return `
/**
 * Set/Edit Fields: ${node.name}
 * Compiled from n8n-nodes-base.set v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const output: DataItem[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const result: DataItem = {
      json: ${baseObj},
      pairedItem: { item: itemIndex },
    };
    if (item.binary) result.binary = item.binary;

${assignmentCode.join('\n')}

    output.push(result);
${duplicateItem ? `    output.push({ ...result, json: { ...result.json } }); // duplicate` : ''}
  }

  return [output];
}`;
}

function generateRawMode(fnName: string, node: ParsedNode): string {
  const jsonOutput = node.parameters.jsonOutput as string | undefined;

  let outputExpr = '{}';
  if (jsonOutput && isExpression(jsonOutput)) {
    outputExpr = compileExpression(jsonOutput);
  } else if (jsonOutput) {
    outputExpr = `JSON.parse(${JSON.stringify(jsonOutput)})`;
  }

  return `
/**
 * Set/Edit Fields (raw): ${node.name}
 * Compiled from n8n-nodes-base.set v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const output: DataItem[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const jsonResult = ${outputExpr};
    output.push({
      json: typeof jsonResult === 'object' && jsonResult !== null ? jsonResult as Record<string, unknown> : { value: jsonResult },
      pairedItem: { item: itemIndex },
    });
  }

  return [output];
}`;
}
