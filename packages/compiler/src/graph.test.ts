/**
 * Tests for DAG graph (buildGraph: topological sort, levels, merge/entry nodes).
 */
import { parseWorkflow } from './parser.js';
import { buildGraph } from './graph.js';
import { loadFixture } from './__test-helpers__/factories.js';

describe('buildGraph', () => {
  it('produces sorted nodes and entry nodes for simple workflow', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof parseWorkflow>[0];
    const parsed = parseWorkflow(workflow);
    const graph = buildGraph(parsed);
    expect(graph.entryNodes).toContain('Trigger');
    expect(graph.sortedNodes).toEqual(['Trigger', 'Set']);
    expect(graph.levels.length).toBeGreaterThanOrEqual(1);
  });

  it('has no merge nodes in simple two-node workflow', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof parseWorkflow>[0];
    const parsed = parseWorkflow(workflow);
    const graph = buildGraph(parsed);
    expect(graph.mergeNodes.size).toBe(0);
  });

  it('builds adjacency from edges', () => {
    const workflow = loadFixture('simple-workflow.json') as Parameters<typeof parseWorkflow>[0];
    const parsed = parseWorkflow(workflow);
    const graph = buildGraph(parsed);
    const triggerAdj = graph.adjacency.get('Trigger');
    expect(triggerAdj).toHaveLength(1);
    expect(triggerAdj![0].node).toBe('Set');
  });
});
