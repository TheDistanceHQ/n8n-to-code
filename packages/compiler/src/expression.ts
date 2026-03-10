/**
 * Expression compiler: converts n8n expressions to TypeScript code strings.
 *
 * n8n expressions use the format: ={{ <js expression> }}
 * Common patterns:
 *   $json.field            -> access current item's json
 *   $('NodeName').item.json.field -> access upstream node output
 *   $input.all()           -> all input items
 *   $input.item.json       -> current item (in per-item mode)
 */

/**
 * Check if a value contains an n8n expression.
 */
export function isExpression(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return value.startsWith('=');
}

/**
 * Compile an n8n expression string to a TypeScript code string.
 *
 * @param expr - The n8n expression (e.g., "={{ $json.field }}")
 * @param itemVar - Variable name for the current item (default: "item")
 * @param outputsVar - Variable name for the node outputs map (default: "nodeOutputs")
 * @param itemIndexVar - Variable name for the current item index (default: "itemIndex")
 * @returns A TypeScript expression string
 */
export function compileExpression(
  expr: string,
  itemVar = 'item',
  outputsVar = 'nodeOutputs',
  itemIndexVar = 'itemIndex',
): string {
  // Strip the leading = and {{ }} wrappers
  let code = expr;

  // Remove leading =
  if (code.startsWith('=')) {
    code = code.slice(1);
  }

  // Check if it's a pure {{ }} expression or has mixed text + expressions
  const templateParts = parseTemplateParts(code);

  if (templateParts.length === 1 && templateParts[0].type === 'expression') {
    // Pure expression: {{ expr }}
    return compileExpressionBody(templateParts[0].value, itemVar, outputsVar, itemIndexVar);
  }

  if (templateParts.length === 1 && templateParts[0].type === 'text') {
    // No expressions, just text with leading =
    return JSON.stringify(templateParts[0].value);
  }

  // Mixed: "text {{ expr }} more text" -> template literal
  const parts = templateParts.map((part) => {
    if (part.type === 'text') {
      return escapeTemplateLiteral(part.value);
    }
    return `\${${compileExpressionBody(part.value, itemVar, outputsVar, itemIndexVar)}}`;
  });

  return '`' + parts.join('') + '`';
}

interface TemplatePart {
  type: 'text' | 'expression';
  value: string;
}

/**
 * Parse a string into text and expression parts.
 * e.g., "Hello {{ $json.name }}, you have {{ $json.count }} items"
 *   -> [{text: "Hello "}, {expr: " $json.name "}, {text: ", you have "}, {expr: " $json.count "}, {text: " items"}]
 */
function parseTemplateParts(input: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let remaining = input;

  while (remaining.length > 0) {
    const openIdx = remaining.indexOf('{{');
    if (openIdx === -1) {
      // No more expressions
      if (remaining.length > 0) {
        parts.push({ type: 'text', value: remaining });
      }
      break;
    }

    // Text before the expression
    if (openIdx > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, openIdx) });
    }

    // Find matching }}
    const closeIdx = remaining.indexOf('}}', openIdx + 2);
    if (closeIdx === -1) {
      // Unmatched {{ -- treat rest as text
      parts.push({ type: 'text', value: remaining.slice(openIdx) });
      break;
    }

    const exprBody = remaining.slice(openIdx + 2, closeIdx).trim();
    parts.push({ type: 'expression', value: exprBody });
    remaining = remaining.slice(closeIdx + 2);
  }

  return parts;
}

/**
 * Compile the body of an expression (inside {{ }}) to TypeScript.
 */
function compileExpressionBody(
  body: string,
  itemVar: string,
  outputsVar: string,
  itemIndexVar: string,
): string {
  let code = body;

  // Replace $json. with item.json.
  code = code.replace(/\$json\b/g, `${itemVar}.json`);

  // Replace $('NodeName').item.json with nodeOutputs lookup
  // Pattern: $('NodeName').item.json.field or $("NodeName").item.json.field
  code = code.replace(
    /\$\(\s*['"]([^'"]+)['"]\s*\)\.item\.json/g,
    (_match, nodeName: string) => {
      const sanitized = sanitizeNodeName(nodeName);
      return `${outputsVar}.get('${nodeName}')![${itemIndexVar}].json`;
    },
  );

  // Replace $('NodeName').first().json
  code = code.replace(
    /\$\(\s*['"]([^'"]+)['"]\s*\)\.first\(\)\.json/g,
    (_match, nodeName: string) => {
      return `${outputsVar}.get('${nodeName}')![0].json`;
    },
  );

  // Replace $('NodeName').all()
  code = code.replace(
    /\$\(\s*['"]([^'"]+)['"]\s*\)\.all\(\)/g,
    (_match, nodeName: string) => {
      return `${outputsVar}.get('${nodeName}')!`;
    },
  );

  // Replace $input.all()
  code = code.replace(/\$input\.all\(\)/g, 'input');

  // Replace $input.item.json
  code = code.replace(/\$input\.item\.json/g, `${itemVar}.json`);

  // Replace $input.first().json
  code = code.replace(/\$input\.first\(\)\.json/g, 'input[0].json');

  // n8n global / date helpers
  code = code.replace(/\$now\b/g, 'new Date()');
  code = code.replace(/\$today\b/g, 'new Date().toISOString().slice(0, 10)');

  return code;
}

function escapeTemplateLiteral(text: string): string {
  return text.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/** Convert a node name to a safe TypeScript identifier */
export function sanitizeNodeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/**
 * Recursively scan a parameters object for expressions and compile them.
 * Returns a new parameters object with expressions replaced by compiled code.
 */
export function compileParameterExpressions(
  params: Record<string, unknown>,
  itemVar = 'item',
  outputsVar = 'nodeOutputs',
  itemIndexVar = 'itemIndex',
): Record<string, unknown> {
  const compiled: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    compiled[key] = compileValue(value, itemVar, outputsVar, itemIndexVar);
  }

  return compiled;
}

function compileValue(
  value: unknown,
  itemVar: string,
  outputsVar: string,
  itemIndexVar: string,
): unknown {
  if (typeof value === 'string' && isExpression(value)) {
    return {
      __compiled: true,
      code: compileExpression(value, itemVar, outputsVar, itemIndexVar),
      original: value,
    };
  }

  if (Array.isArray(value)) {
    return value.map((v) => compileValue(v, itemVar, outputsVar, itemIndexVar));
  }

  if (value !== null && typeof value === 'object') {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      obj[k] = compileValue(v, itemVar, outputsVar, itemIndexVar);
    }
    return obj;
  }

  return value;
}
