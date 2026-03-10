/**
 * Inline code generator for the IF node (n8n-nodes-base.if).
 * Compiles conditional routing to native TypeScript if/else.
 */

import type { ParsedNode } from '../../parser.js';
import { compileExpression, isExpression } from '../../expression.js';
import { sanitizeNodeName } from '../../expression.js';

export function generateIfNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;
  const conditions = extractConditions(node.parameters);

  return `
/**
 * IF: ${node.name}
 * Compiled from n8n-nodes-base.if v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const trueItems: DataItem[] = [];
  const falseItems: DataItem[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    try {
      const pass = Boolean(${conditions});
      if (pass) {
        trueItems.push({ ...item, pairedItem: { item: itemIndex } });
      } else {
        falseItems.push({ ...item, pairedItem: { item: itemIndex } });
      }
    } catch (error) {
      // On error, route to false branch
      falseItems.push({ ...item, pairedItem: { item: itemIndex } });
    }
  }

  return [trueItems, falseItems];
}`;
}

/**
 * Extract conditions from IF node parameters and compile to a JS boolean expression.
 */
function extractConditions(params: Record<string, unknown>): string {
  const conditions = params.conditions as Record<string, unknown> | undefined;
  if (!conditions) return 'false';

  const conditionList = (conditions.conditions ?? []) as Array<Record<string, unknown>>;
  if (conditionList.length === 0) return 'false';

  const compiledConditions = conditionList.map((cond) => {
    const leftValue = cond.leftValue as string | undefined;
    const rightValue = cond.rightValue;
    const operator = cond.operator as Record<string, string> | undefined;

    if (!leftValue || !operator) return 'false';

    const left = isExpression(leftValue)
      ? compileExpression(leftValue)
      : JSON.stringify(leftValue);

    const right = typeof rightValue === 'string' && isExpression(rightValue)
      ? compileExpression(rightValue)
      : JSON.stringify(rightValue);

    return compileOperator(left, right, operator);
  });

  // Default: AND all conditions (n8n v2 combinator defaults to "and")
  const combinator = ((conditions.options as Record<string, unknown>)?.combinator ?? 'and') as string;
  const joiner = combinator === 'or' ? ' || ' : ' && ';

  return compiledConditions.join(joiner);
}

function compileOperator(
  left: string,
  right: string,
  operator: Record<string, string>,
): string {
  const opType = operator.type ?? 'string';
  const operation = operator.operation ?? 'equals';

  switch (opType) {
    case 'string':
      return compileStringOp(left, right, operation);
    case 'number':
      return compileNumberOp(left, right, operation);
    case 'boolean':
      return compileBooleanOp(left, right, operation);
    case 'dateTime':
      return compileDateOp(left, right, operation);
    case 'array':
      return compileArrayOp(left, right, operation);
    default:
      return `${left} === ${right}`;
  }
}

function compileStringOp(left: string, right: string, op: string): string {
  switch (op) {
    case 'equals': return `String(${left}) === String(${right})`;
    case 'notEquals': return `String(${left}) !== String(${right})`;
    case 'contains': return `String(${left}).includes(String(${right}))`;
    case 'notContains': return `!String(${left}).includes(String(${right}))`;
    case 'startsWith': return `String(${left}).startsWith(String(${right}))`;
    case 'endsWith': return `String(${left}).endsWith(String(${right}))`;
    case 'regex': return `new RegExp(${right}).test(String(${left}))`;
    case 'notRegex': return `!new RegExp(${right}).test(String(${left}))`;
    case 'empty': return `!${left} || String(${left}).length === 0`;
    case 'notEmpty': return `!!${left} && String(${left}).length > 0`;
    default: return `${left} === ${right}`;
  }
}

function compileNumberOp(left: string, right: string, op: string): string {
  switch (op) {
    case 'equals': return `Number(${left}) === Number(${right})`;
    case 'notEquals': return `Number(${left}) !== Number(${right})`;
    case 'gt': return `Number(${left}) > Number(${right})`;
    case 'gte': return `Number(${left}) >= Number(${right})`;
    case 'lt': return `Number(${left}) < Number(${right})`;
    case 'lte': return `Number(${left}) <= Number(${right})`;
    case 'empty': return `${left} === null || ${left} === undefined`;
    case 'notEmpty': return `${left} !== null && ${left} !== undefined`;
    default: return `Number(${left}) === Number(${right})`;
  }
}

function compileBooleanOp(left: string, right: string, op: string): string {
  switch (op) {
    case 'equals': return `Boolean(${left}) === Boolean(${right})`;
    case 'notEquals': return `Boolean(${left}) !== Boolean(${right})`;
    case 'true': return `Boolean(${left}) === true`;
    case 'false': return `Boolean(${left}) === false`;
    case 'empty': return `${left} === null || ${left} === undefined`;
    case 'notEmpty': return `${left} !== null && ${left} !== undefined`;
    default: return `Boolean(${left}) === Boolean(${right})`;
  }
}

function compileDateOp(left: string, right: string, op: string): string {
  switch (op) {
    case 'after': return `new Date(${left} as string) > new Date(${right} as string)`;
    case 'before': return `new Date(${left} as string) < new Date(${right} as string)`;
    case 'equals': return `new Date(${left} as string).getTime() === new Date(${right} as string).getTime()`;
    default: return `new Date(${left} as string).getTime() === new Date(${right} as string).getTime()`;
  }
}

function compileArrayOp(left: string, right: string, op: string): string {
  switch (op) {
    case 'contains': return `Array.isArray(${left}) && (${left} as unknown[]).includes(${right})`;
    case 'notContains': return `Array.isArray(${left}) && !(${left} as unknown[]).includes(${right})`;
    case 'lengthEquals': return `Array.isArray(${left}) && (${left} as unknown[]).length === Number(${right})`;
    case 'lengthGt': return `Array.isArray(${left}) && (${left} as unknown[]).length > Number(${right})`;
    case 'lengthLt': return `Array.isArray(${left}) && (${left} as unknown[]).length < Number(${right})`;
    case 'empty': return `!Array.isArray(${left}) || (${left} as unknown[]).length === 0`;
    case 'notEmpty': return `Array.isArray(${left}) && (${left} as unknown[]).length > 0`;
    default: return `${left} === ${right}`;
  }
}
