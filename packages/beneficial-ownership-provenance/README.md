# @sandipants/beneficial-ownership-provenance

Reusable ES module for beneficial ownership, ownership/control graph analysis, evidence provenance and cached rule evaluation in future web app builds.

## Import

```js
import {
  OwnershipGraph,
  InterestType,
  EvidenceStatus,
  EpistemicClass,
  evaluateBeneficialOwnerCached
} from '@sandipants/beneficial-ownership-provenance';
```

## Core design

The module keeps separate layers for source records, graph relationships and rule-derived conclusions. It does not collapse legal ownership, economic interest, beneficial entitlement, voting rights, practical influence, nominee/fiduciary roles and intermediary relationships into one boolean.

```js
const graph = new OwnershipGraph();

graph
  .addNode({ id: 'p:1', kind: 'person', name: 'Person 1' })
  .addNode({ id: 'e:a', kind: 'entity', name: 'Holding A' })
  .addNode({ id: 'e:target', kind: 'entity', name: 'Target Entity' })
  .addSource({ id: 'src:1', title: 'Primary record', authorityLevel: 'primary-record' })
  .addRelationship({
    id: 'r:1',
    from: 'p:1',
    to: 'e:a',
    interestType: InterestType.SHAREHOLDING,
    percentage: 60,
    evidence: ['src:1'],
    evidenceStatus: EvidenceStatus.VERIFIED,
    epistemicClass: EpistemicClass.FACT
  })
  .addRelationship({
    id: 'r:2',
    from: 'e:a',
    to: 'e:target',
    interestType: InterestType.SHAREHOLDING,
    percentage: 50,
    evidence: ['src:1'],
    evidenceStatus: EvidenceStatus.VERIFIED,
    epistemicClass: EpistemicClass.FACT
  });

const result = await evaluateBeneficialOwnerCached(graph, {
  personId: 'p:1',
  entityId: 'e:target'
});
```

The simple path calculation above is 60% × 50% = 30%. Parallel/cross-held paths are flagged for reconciliation instead of being presented as magically exact, because arithmetic has enough dignity problems already.

## Caching

Browser runtimes default to localStorage. Server runtimes use an in-memory cache. The cache key is derived from the module version, graph snapshot, rule and query, so a source or relationship change invalidates the previous result automatically.

Custom cache adapters can implement Redis, IndexedDB or a database using `get`, `set`, `delete`, and `clear`.

## Rule layer

The bundled `AUSTRALIA_GENERIC_25_CONTROL_RULE` is a reusable screening template, not a substitute for checking the exact operative statute, instrument, entity type and effective date. Use `createBeneficialOwnershipRule()` to encode a more precise jurisdiction-specific rule.

## BODS interoperability

`exportBodsLike()` and `importBodsLike()` preserve the person/entity/relationship semantics inspired by Open Ownership's BODS model. They deliberately do not claim complete BODS v0.4 schema conformance. Formal BODS publication should still be validated against the official Open Ownership schema.

## Provenance discipline

Missing percentages, missing intermediary records and unverified control relationships remain visible as gaps. The evaluator derives a conclusion from the recorded evidence but never silently upgrades an inference into a verified fact.
