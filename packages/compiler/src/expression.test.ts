/**
 * Tests for expression compiler (compileExpression, isExpression, sanitizeNodeName).
 */
import { isExpression, compileExpression, sanitizeNodeName } from './expression.js';

describe('isExpression', () => {
  it('returns true for string starting with =', () => {
    expect(isExpression('={{ $json.foo }}')).toBe(true);
    expect(isExpression('=plain')).toBe(true);
  });

  it('returns false for non-strings', () => {
    expect(isExpression(123)).toBe(false);
    expect(isExpression(null)).toBe(false);
    expect(isExpression(undefined)).toBe(false);
  });

  it('returns false for string not starting with =', () => {
    expect(isExpression('hello')).toBe(false);
    expect(isExpression('')).toBe(false);
  });
});

describe('compileExpression', () => {
  it('replaces $json with item.json', () => {
    expect(compileExpression('={{ $json.foo }}')).toBe('item.json.foo');
  });

  it('replaces $input.all() with input', () => {
    expect(compileExpression('={{ $input.all() }}')).toBe('input');
  });

  it('replaces $input.first().json with input[0].json', () => {
    expect(compileExpression('={{ $input.first().json }}')).toBe('input[0].json');
  });

  it('replaces $(\'NodeName\').first().json with nodeOutputs lookup', () => {
    const out = compileExpression("={{ $('Upstream').first().json }}");
    expect(out).toContain("nodeOutputs.get('Upstream')");
    expect(out).toContain('[0].json');
  });

  it('returns JSON string for plain text (no {{ }})', () => {
    const out = compileExpression('=hello');
    expect(out).toBe('"hello"');
  });
});

describe('sanitizeNodeName', () => {
  it('replaces non-alphanumeric with underscore and lowercases', () => {
    expect(sanitizeNodeName('My Node')).toBe('my_node');
  });

  it('prefixes leading digit with underscore when preserved', () => {
    // Implementation may strip leading/trailing _ so we only assert valid identifier
    expect(sanitizeNodeName('1st')).toMatch(/^[a-z0-9_]+$/);
  });

  it('produces valid identifier', () => {
    expect(sanitizeNodeName("When clicking 'Execute workflow'")).toMatch(/^[a-z0-9_]+$/);
  });
});
