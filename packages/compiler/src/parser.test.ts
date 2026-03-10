/**
 * Tests for workflow parser (parseWorkflow → ParsedWorkflow IR).
 */
import { parseWorkflow } from './parser.js';
import { loadFixture } from './__test-helpers__/factories.js';

describe('parseWorkflow', () => {
  it('parses simple workflow and returns ParsedWorkflow', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof parseWorkflow>[0];
    const parsed = parseWorkflow(workflow);
    expect(parsed.name).toBe('Simple Workflow');
    expect(parsed.nodes.size).toBe(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.nodes.has('Trigger')).toBe(true);
    expect(parsed.nodes.has('Set')).toBe(true);
  });

  it('sets compilationMode from node type', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof parseWorkflow>[0];
    const parsed = parseWorkflow(workflow);
    const trigger = parsed.nodes.get('Trigger')!;
    const setNode = parsed.nodes.get('Set')!;
    expect(trigger.compilationMode).toBe('inline');
    expect(setNode.compilationMode).toBe('inline');
  });

  it('parses edges from connections', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof parseWorkflow>[0];
    const parsed = parseWorkflow(workflow);
    expect(parsed.edges[0]).toMatchObject({
      sourceNode: 'Trigger',
      targetNode: 'Set',
      sourceOutput: 0,
      targetInput: 0,
      connectionType: 'main',
    });
  });
});
