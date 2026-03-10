/**
 * Inline code generator for the Switch node (n8n-nodes-base.switch).
 * Compiles multi-branch routing to native TypeScript.
 */

import type { ParsedNode } from '../../parser.js';
import { compileExpression, isExpression, sanitizeNodeName } from '../../expression.js';

export function generateSwitchNode(node: ParsedNode): string {
  const fnName = `node_${sanitizeNodeName(node.name)}`;
  const mode = (node.parameters.mode as string) ?? 'rules';

  if (mode === 'expression') {
    return generateExpressionSwitch(fnName, node);
  }

  return generateRulesSwitch(fnName, node);
}

function generateRulesSwitch(fnName: string, node: ParsedNode): string {
  const rulesContainer = node.parameters.rules as Record<string, unknown> | undefined;
  const rules = (rulesContainer?.values ?? []) as Array<Record<string, unknown>>;
  const options = node.parameters.options as Record<string, unknown> | undefined;
  const fallbackOutput = (options?.fallbackOutput as string) ?? 'none';
  const numOutputs = rules.length + (fallbackOutput !== 'none' ? 1 : 0);

  const ruleChecks = rules.map((rule, idx) => {
    const conditions = rule.conditions as Record<string, unknown> | undefined;
    const conditionList = ((conditions?.conditions ?? []) as Array<Record<string, unknown>>);

    const checks = conditionList.map((cond) => {
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

      return compileCondition(left, right, operator);
    });

    const combinedCheck = checks.length > 0 ? checks.join(' && ') : 'true';
    return `      if (${combinedCheck}) { outputs[${idx}].push({ ...item, pairedItem: { item: itemIndex } }); matched = true; }`;
  });

  return `
/**
 * Switch: ${node.name}
 * Compiled from n8n-nodes-base.switch v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const outputs: DataItem[][] = Array.from({ length: ${numOutputs} }, () => []);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    let matched = false;

${ruleChecks.join('\n      else ')}
${fallbackOutput !== 'none' ? `
      if (!matched) {
        outputs[${rules.length}].push({ ...item, pairedItem: { item: itemIndex } });
      }` : ''}
  }

  return outputs;
}`;
}

function generateExpressionSwitch(fnName: string, node: ParsedNode): string {
  const outputExpr = node.parameters.output as string | undefined;
  const numOutputs = (node.parameters.numberOutputs as number) ?? 4;

  let switchExpr = '0';
  if (outputExpr && isExpression(outputExpr)) {
    switchExpr = compileExpression(outputExpr);
  }

  return `
/**
 * Switch (Expression): ${node.name}
 * Compiled from n8n-nodes-base.switch v${node.typeVersion}
 */
async function ${fnName}(
  input: DataItem[] | DataItem[][],
  nodeOutputs: NodeOutputMap,
): Promise<DataItem[][]> {
  const items = normalizeInput(input);
  const outputs: DataItem[][] = Array.from({ length: ${numOutputs} }, () => []);

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const outputIdx = Number(${switchExpr}) || 0;
    const clampedIdx = Math.max(0, Math.min(outputIdx, ${numOutputs - 1}));
    outputs[clampedIdx].push({ ...item, pairedItem: { item: itemIndex } });
  }

  return outputs;
}`;
}

function compileCondition(
  left: string,
  right: string,
  operator: Record<string, string>,
): string {
  const opType = operator.type ?? 'string';
  const operation = operator.operation ?? 'equals';

  switch (`${opType}:${operation}`) {
    case 'string:equals': return `String(${left}) === String(${right})`;
    case 'string:notEquals': return `String(${left}) !== String(${right})`;
    case 'string:contains': return `String(${left}).includes(String(${right}))`;
    case 'string:notContains': return `!String(${left}).includes(String(${right}))`;
    case 'string:startsWith': return `String(${left}).startsWith(String(${right}))`;
    case 'string:endsWith': return `String(${left}).endsWith(String(${right}))`;
    case 'string:regex': return `new RegExp(${right}).test(String(${left}))`;
    case 'string:empty': return `!${left} || String(${left}).length === 0`;
    case 'string:notEmpty': return `!!${left} && String(${left}).length > 0`;
    case 'number:equals': return `Number(${left}) === Number(${right})`;
    case 'number:notEquals': return `Number(${left}) !== Number(${right})`;
    case 'number:gt': return `Number(${left}) > Number(${right})`;
    case 'number:gte': return `Number(${left}) >= Number(${right})`;
    case 'number:lt': return `Number(${left}) < Number(${right})`;
    case 'number:lte': return `Number(${left}) <= Number(${right})`;
    case 'boolean:equals': return `Boolean(${left}) === Boolean(${right})`;
    case 'boolean:true': return `Boolean(${left}) === true`;
    case 'boolean:false': return `Boolean(${left}) === false`;
    default: return `${left} === ${right}`;
  }
}
