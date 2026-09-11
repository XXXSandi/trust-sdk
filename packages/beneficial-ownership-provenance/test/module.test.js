import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OwnershipGraph,
  InterestType,
  EvidenceStatus,
  EpistemicClass,
  MemoryCache,
  evaluateBeneficialOwner,
  evaluateBeneficialOwnerCached,
  exportBodsLike,
  importBodsLike
} from '../index.js';

function sampleGraph() {
  const graph = new OwnershipGraph();
  graph.addNode({ id: 'p', kind: 'person', name: 'P' });
  graph.addNode({ id: 'a', kind: 'entity', name: 'A' });
  graph.addNode({ id: 'e', kind: 'entity', name: 'E' });
  graph.addSource({ id: 's', title: 'Primary source' });
  graph.addRelationship({
    id: 'r1', from: 'p', to: 'a', interestType: InterestType.SHAREHOLDING,
    percentage: 60, evidence: ['s'], evidenceStatus: EvidenceStatus.VERIFIED,
    epistemicClass: EpistemicClass.FACT
  });
  graph.addRelationship({
    id: 'r2', from: 'a', to: 'e', interestType: InterestType.SHAREHOLDING,
    percentage: 50, evidence: ['s'], evidenceStatus: EvidenceStatus.VERIFIED,
    epistemicClass: EpistemicClass.FACT
  });
  return graph;
}

test('computes indirect simple-path ownership', () => {
  const result = evaluateBeneficialOwner(sampleGraph(), { personId: 'p', entityId: 'e' });
  assert.equal(result.ownership.simplePathTotalPercentage, 30);
  assert.equal(result.status, 'qualifies');
});

test('control route is independent of ownership percentage', () => {
  const graph = new OwnershipGraph();
  graph.addNode({ id: 'p', kind: 'person' });
  graph.addNode({ id: 'e', kind: 'entity' });
  graph.addRelationship({
    id: 'c', from: 'p', to: 'e', interestType: InterestType.PRACTICAL_INFLUENCE,
    control: true, evidenceStatus: EvidenceStatus.VERIFIED
  });
  const result = evaluateBeneficialOwner(graph, { personId: 'p', entityId: 'e' });
  assert.equal(result.status, 'qualifies');
  assert.equal(result.reasons[0].basis, 'control');
});

test('missing percentage remains an evidence gap', () => {
  const graph = new OwnershipGraph();
  graph.addNode({ id: 'p', kind: 'person' });
  graph.addNode({ id: 'e', kind: 'entity' });
  graph.addRelationship({ id: 'r', from: 'p', to: 'e', interestType: InterestType.SHAREHOLDING });
  const result = evaluateBeneficialOwner(graph, { personId: 'p', entityId: 'e' });
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.ownership.unknownPathCount, 1);
});

test('cache hits on identical graph/rule/query', async () => {
  const cache = new MemoryCache();
  const graph = sampleGraph();
  const query = { personId: 'p', entityId: 'e' };
  const first = await evaluateBeneficialOwnerCached(graph, query, { cache });
  const second = await evaluateBeneficialOwnerCached(graph, query, { cache });
  assert.equal(first.cache.hit, false);
  assert.equal(second.cache.hit, true);
  assert.equal(first.cache.key, second.cache.key);
});

test('BODS-like transport round-trips the graph', () => {
  const roundTrip = importBodsLike(exportBodsLike(sampleGraph()));
  assert.equal(roundTrip.nodes.size, 3);
  assert.equal(roundTrip.relationships.size, 2);
  assert.equal(roundTrip.getRelationship('r2').percentage, 50);
});
