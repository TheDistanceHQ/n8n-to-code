/**
 * Minimal expression evaluator for the context shim.
 * Evaluates n8n expressions at runtime (for shimmed nodes).
 *
 * This handles the common expression patterns without needing
 * the full n8n expression engine.
 */

export interface EvalItem {
  json: Record<string, unknown>;
  binary?: Record<string, unknown>;
}

export class ExpressionEvaluator {
  private nodeOutputs: Map<string, EvalItem[]>;

  constructor(nodeOutputs: Map<string, EvalItem[]>) {
    this.nodeOutputs = nodeOutputs;
  }

  /**
   * Evaluate an n8n expression string.
   * @param expression - The expression starting with '='
   * @param item - The current data item
   * @param itemIndex - The current item index
   */
  evaluate(expression: string, item: EvalItem, itemIndex: number): unknown {
    // Strip leading =
    let expr = expression.startsWith('=') ? expression.slice(1) : expression;

    // Check for {{ }} template parts
    const parts = this.parseTemplateParts(expr);

    if (parts.length === 1 && parts[0].type === 'expression') {
      // Pure expression
      return this.evaluateBody(parts[0].value, item, itemIndex);
    }

    if (parts.length === 1 && parts[0].type === 'text') {
      return parts[0].value;
    }

    // Template string: mix of text and expressions
    return parts
      .map((part) => {
        if (part.type === 'text') return part.value;
        const result = this.evaluateBody(part.value, item, itemIndex);
        return result === undefined || result === null ? '' : String(result);
      })
      .join('');
  }

  private evaluateBody(body: string, item: EvalItem, itemIndex: number): unknown {
    // Build a sandboxed evaluation context
    const $json = item.json;
    const $input = {
      all: () => [item], // Simplified -- in real n8n this returns all input items
      first: () => item,
      last: () => item,
      item,
    };
    const $binary = item.binary ?? {};

    // Create a $() function for accessing other nodes
    const $ = (nodeName: string) => {
      const outputs = this.nodeOutputs.get(nodeName);
      if (!outputs) return { item: { json: {} }, first: () => ({ json: {} }), all: () => [] };

      return {
        item: outputs[itemIndex] ?? outputs[0] ?? { json: {} },
        first: () => outputs[0] ?? { json: {} },
        last: () => outputs[outputs.length - 1] ?? { json: {} },
        all: () => outputs,
      };
    };

    try {
      // Use Function constructor for sandboxed evaluation
      const fn = new Function(
        '$json',
        '$input',
        '$binary',
        '$',
        '$itemIndex',
        `"use strict"; return (${body});`,
      );
      return fn($json, $input, $binary, $, itemIndex);
    } catch (error) {
      // If evaluation fails, try some common patterns manually
      return this.fallbackEvaluate(body, item, itemIndex);
    }
  }

  private fallbackEvaluate(
    body: string,
    item: EvalItem,
    itemIndex: number,
  ): unknown {
    // Try simple $json.property access
    const jsonMatch = body.match(/^\$json\.(.+)$/);
    if (jsonMatch) {
      return this.getNestedProperty(item.json, jsonMatch[1]);
    }

    // Try $('NodeName').item.json.property
    const nodeRefMatch = body.match(
      /^\$\(\s*['"]([^'"]+)['"]\s*\)\.item\.json\.(.+)$/,
    );
    if (nodeRefMatch) {
      const outputs = this.nodeOutputs.get(nodeRefMatch[1]);
      const targetItem = outputs?.[itemIndex] ?? outputs?.[0];
      if (targetItem) {
        return this.getNestedProperty(targetItem.json, nodeRefMatch[2]);
      }
    }

    return undefined;
  }

  private getNestedProperty(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;

      // Handle array access: field[0]
      const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
      if (arrayMatch) {
        current = (current as Record<string, unknown>)[arrayMatch[1]];
        if (Array.isArray(current)) {
          current = current[parseInt(arrayMatch[2])];
        } else {
          return undefined;
        }
      } else {
        current = (current as Record<string, unknown>)[part];
      }
    }

    return current;
  }

  private parseTemplateParts(input: string): Array<{ type: 'text' | 'expression'; value: string }> {
    const parts: Array<{ type: 'text' | 'expression'; value: string }> = [];
    let remaining = input;

    while (remaining.length > 0) {
      const openIdx = remaining.indexOf('{{');
      if (openIdx === -1) {
        if (remaining.length > 0) parts.push({ type: 'text', value: remaining });
        break;
      }

      if (openIdx > 0) {
        parts.push({ type: 'text', value: remaining.slice(0, openIdx) });
      }

      const closeIdx = remaining.indexOf('}}', openIdx + 2);
      if (closeIdx === -1) {
        parts.push({ type: 'text', value: remaining.slice(openIdx) });
        break;
      }

      parts.push({ type: 'expression', value: remaining.slice(openIdx + 2, closeIdx).trim() });
      remaining = remaining.slice(closeIdx + 2);
    }

    return parts;
  }
}
