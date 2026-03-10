/**
 * Inline code generator for the Filter node (n8n-nodes-base.filter).
 * Similar to IF but only has one output (matching items).
 */

import type { ParsedNode } from '../../parser.js';
import { compileExpression, isExpression, sanitizeNodeName } from '../../expression.js';

export function generateFilterNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;
  const conditions = extractFilterConditions(node.parameters);

  return `
/**
 * Filter: ${node.name}
 * Compiled from n8n-nodes-base.filter v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const kept: DataItem[] = [];
  const discarded: DataItem[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    try {
      const pass = Boolean(${conditions});
      if (pass) {
        kept.push({ ...item, pairedItem: { item: itemIndex } });
      } else {
        discarded.push({ ...item, pairedItem: { item: itemIndex } });
      }
    } catch {
      discarded.push({ ...item, pairedItem: { item: itemIndex } });
    }
  }

  return [kept, discarded];
}`;
}

function extractFilterConditions(params: Record<string, unknown>): string {
  const conditions = params.conditions as Record<string, unknown> | undefined;
  if (!conditions) return 'true';

  const conditionList = (conditions.conditions ?? []) as Array<Record<string, unknown>>;
  if (conditionList.length === 0) return 'true';

  const compiledConditions = conditionList.map((cond) => {
    const leftValue = cond.leftValue as string | undefined;
    const rightValue = cond.rightValue;
    const operator = cond.operator as Record<string, string> | undefined;

    if (!leftValue || !operator) return 'true';

    const left = isExpression(leftValue)
      ? compileExpression(leftValue)
      : JSON.stringify(leftValue);
    const right = typeof rightValue === 'string' && isExpression(rightValue)
      ? compileExpression(rightValue)
      : JSON.stringify(rightValue);

    const opType = operator.type ?? 'string';
    const operation = operator.operation ?? 'equals';

    switch (`${opType}:${operation}`) {
      case 'string:equals': return `String(${left}) === String(${right})`;
      case 'string:notEquals': return `String(${left}) !== String(${right})`;
      case 'string:contains': return `String(${left}).includes(String(${right}))`;
      case 'string:notContains': return `!String(${left}).includes(String(${right}))`;
      case 'string:empty': return `!${left} || String(${left}).length === 0`;
      case 'string:notEmpty': return `!!${left} && String(${left}).length > 0`;
      case 'number:equals': return `Number(${left}) === Number(${right})`;
      case 'number:gt': return `Number(${left}) > Number(${right})`;
      case 'number:lt': return `Number(${left}) < Number(${right})`;
      case 'boolean:true': return `Boolean(${left}) === true`;
      case 'boolean:false': return `Boolean(${left}) === false`;
      default: return `${left} === ${right}`;
    }
  });

  const combinator = ((conditions.options as Record<string, unknown>)?.combinator ?? 'and') as string;
  const joiner = combinator === 'or' ? ' || ' : ' && ';
  return compiledConditions.join(joiner);
}
