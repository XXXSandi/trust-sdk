export const MODULE_VERSION = '1.0.0';
export const DEFAULT_TTL_MS = 86400000;

export const EpistemicClass = Object.freeze({
  FACT: 'fact', INFERENCE: 'inference', ASSUMPTION: 'assumption', SPECULATION: 'speculation', UNKNOWN: 'unknown'
});
export const EvidenceStatus = Object.freeze({
  VERIFIED: 'verified', CONSENSUS: 'consensus', DEDUCTION: 'deduction', INFERENCE: 'inference', ASSUMPTION: 'assumption', SPECULATION: 'speculation', CONTRADICTED: 'contradicted', FALSIFIED: 'falsified', UNKNOWN: 'unknown'
});
export const InterestType = Object.freeze({
  LEGAL_OWNERSHIP: 'legalOwnership', ECONOMIC_INTEREST: 'economicInterest', BENEFICIAL_ENTITLEMENT: 'beneficialEntitlement', SHAREHOLDING: 'shareholding', VOTING_RIGHTS: 'votingRights', CONTROL: 'control', PRACTICAL_INFLUENCE: 'practicalInfluence', BOARD_APPOINTMENT: 'boardAppointment', POLICY_CONTROL: 'policyControl', NOMINEE: 'nominee', FIDUCIARY: 'fiduciary', INTERMEDIARY: 'intermediary', TRUSTEE: 'trustee', BENEFICIARY: 'beneficiary', SETTLOR: 'settlor', PROTECTOR: 'protector', OTHER: 'other'
});

const OWNERSHIP_TYPES = new Set([InterestType.LEGAL_OWNERSHIP, InterestType.ECONOMIC_INTEREST, InterestType.BENEFICIAL_ENTITLEMENT, InterestType.SHAREHOLDING, InterestType.VOTING_RIGHTS]);
const CONTROL_TYPES = new Set([InterestType.CONTROL, InterestType.PRACTICAL_INFLUENCE, InterestType.BOARD_APPOINTMENT, InterestType.POLICY_CONTROL, InterestType.VOTING_RIGHTS]);
const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
const byId = (a,b) => String(a.id).localeCompare(String(b.id));

function assertId(v, label) { if (typeof v !== 'string' || !v.trim()) throw new TypeError(`${label} must be a non-empty string`); }
function assertPercent(v, label='percentage') { if (v == null) return; if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) throw new RangeError(`${label} must be 0..100`); }
function ordered(v) { if (Array.isArray(v)) return v.map(ordered); if (v && typeof v === 'object') return Object.keys(v).sort().reduce((o,k)=>(o[k]=ordered(v[k]),o),{}); return v; }
export const stableStringify = v => JSON.stringify(ordered(v));
export async function sha256(v) {
  const text = typeof v === 'string' ? v : stableStringify(v);
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(text);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  let h1=0xdeadbeef^text.length,h2=0x41c6ce57^text.length;
  for(let i=0;i<text.length;i++){const ch=text.charCodeAt(i);h1=Math.imul(h1^ch,2654435761);h2=Math.imul(h2^ch,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return `${(h2>>>0).toString(16).padStart(8,'0')}${(h1>>>0).toString(16).padStart(8,'0')}`;
}

export class OwnershipGraph {
  constructor(snapshot){ this.nodes=new Map(); this.relationships=new Map(); this.sources=new Map(); if(snapshot) this.load(snapshot); }
  addNode(n){ assertId(n?.id,'node.id'); if(!['person','entity'].includes(n.kind)) throw new TypeError("node.kind must be 'person' or 'entity'"); this.nodes.set(n.id,{id:n.id,kind:n.kind,name:n.name??n.id,identifiers:clone(n.identifiers??[]),jurisdiction:n.jurisdiction??null,metadata:clone(n.metadata??{})}); return this; }
  addSource(s){ assertId(s?.id,'source.id'); this.sources.set(s.id,{id:s.id,title:s.title??s.id,uri:s.uri??null,jurisdiction:s.jurisdiction??null,authorityLevel:s.authorityLevel??'unknown',retrievedAt:s.retrievedAt??null,effectiveFrom:s.effectiveFrom??null,effectiveTo:s.effectiveTo??null,excerpt:s.excerpt??null,hash:s.hash??null,metadata:clone(s.metadata??{})}); return this; }
  addRelationship(r){ assertId(r?.id,'relationship.id'); assertId(r?.from,'relationship.from'); assertId(r?.to,'relationship.to'); if(!this.nodes.has(r.from)||!this.nodes.has(r.to)) throw new Error(`Both relationship endpoints must exist before adding ${r.id}`); assertPercent(r.percentage); this.relationships.set(r.id,{id:r.id,from:r.from,to:r.to,interestType:r.interestType??InterestType.OTHER,percentage:r.percentage??null,directOrIndirect:r.directOrIndirect??'unknown',beneficialOwnershipOrControl:r.beneficialOwnershipOrControl??null,control:r.control??null,startDate:r.startDate??null,endDate:r.endDate??null,evidence:[...(r.evidence??[])],epistemicClass:r.epistemicClass??EpistemicClass.UNKNOWN,evidenceStatus:r.evidenceStatus??EvidenceStatus.UNKNOWN,missingLink:r.missingLink??null,metadata:clone(r.metadata??{})}); return this; }
  getNode(id){return this.nodes.get(id)??null;} getRelationship(id){return this.relationships.get(id)??null;} getSource(id){return this.sources.get(id)??null;}
  outgoing(id,p=()=>true){return [...this.relationships.values()].filter(r=>r.from===id&&p(r));}
  findPaths(from,to,{maxDepth=8,relationshipFilter=()=>true}={}){ const out=[]; const visit=(id,path,seen)=>{ if(path.length>maxDepth)return; if(id===to&&path.length){out.push([...path]);return;} for(const r of this.outgoing(id,relationshipFilter)){if(seen.has(r.to))continue;const n=new Set(seen);n.add(r.to);visit(r.to,[...path,r],n);} }; visit(from,[],new Set([from])); return out; }
  findOwnershipPaths(personId,entityId,o={}){return this.findPaths(personId,entityId,{...o,relationshipFilter:r=>OWNERSHIP_TYPES.has(r.interestType)}).map(describeOwnershipPath);}
  findControlPaths(personId,entityId,o={}){return this.findPaths(personId,entityId,{...o,relationshipFilter:r=>CONTROL_TYPES.has(r.interestType)||r.control===true}).map(p=>({relationshipIds:p.map(r=>r.id),relationships:clone(p),direct:p.length===1,sourceIds:[...new Set(p.flatMap(r=>r.evidence??[]))],fullyVerified:p.every(r=>r.evidenceStatus===EvidenceStatus.VERIFIED)}));}
  ownershipSummary(personId,entityId,o={}){const paths=this.findOwnershipPaths(personId,entityId,o),known=paths.filter(p=>p.percentage!=null),unknown=paths.filter(p=>p.percentage==null);return{personId,entityId,paths,simplePathTotalPercentage:known.reduce((s,p)=>s+p.percentage,0),knownPathCount:known.length,unknownPathCount:unknown.length,exact:paths.length<=1&&unknown.length===0,method:'multiply percentages within each acyclic path; add path contributions',warning:paths.length>1?'Parallel or cross-held paths can double-count ownership; reconcile the graph before treating the total as exact.':null};}
  controlSummary(personId,entityId,o={}){const paths=this.findControlPaths(personId,entityId,o);return{personId,entityId,paths,hasControlPath:paths.length>0,verifiedControlPath:paths.some(p=>p.fullyVerified)};}
  snapshot(){return{schemaVersion:'1.0',moduleVersion:MODULE_VERSION,nodes:[...this.nodes.values()].sort(byId),relationships:[...this.relationships.values()].sort(byId),sources:[...this.sources.values()].sort(byId)};}
  load(s){this.nodes.clear();this.relationships.clear();this.sources.clear();for(const x of s?.sources??[])this.addSource(x);for(const x of s?.nodes??[])this.addNode(x);for(const x of s?.relationships??[])this.addRelationship(x);return this;}
}

function describeOwnershipPath(path){let proportion=1;const missing=[];for(const r of path){if(r.percentage==null)missing.push({relationshipId:r.id,field:'percentage',missingLink:r.missingLink??null});else proportion*=r.percentage/100;}return{relationshipIds:path.map(r=>r.id),relationships:clone(path),percentage:missing.length?null:proportion*100,direct:path.length===1,missing,sourceIds:[...new Set(path.flatMap(r=>r.evidence??[]))],fullyVerified:path.every(r=>r.evidenceStatus===EvidenceStatus.VERIFIED)};}

export function createBeneficialOwnershipRule({id,version='1.0',jurisdiction,ownershipThresholdPercentage=null,controlQualifies=true,requireIndividual=true,effectiveFrom=null,effectiveTo=null,sourceRefs=[],notes=null}){assertId(id,'rule.id');assertPercent(ownershipThresholdPercentage,'ownershipThresholdPercentage');return Object.freeze({id,version,jurisdiction,ownershipThresholdPercentage,controlQualifies,requireIndividual,effectiveFrom,effectiveTo,sourceRefs:[...sourceRefs],notes});}
export const AUSTRALIA_GENERIC_25_CONTROL_RULE=createBeneficialOwnershipRule({id:'AU-generic-25-or-control',version:'2026.09',jurisdiction:'Australia',ownershipThresholdPercentage:25,controlQualifies:true,requireIndividual:true,sourceRefs:['https://www.austrac.gov.au/industry-and-business/obligations-and-guidance/additional-guidance/determining-ownership-and-control-structures','https://www.legislation.gov.au/F2026L00995/asmade/text'],notes:'Screening template. Confirm the operative statute, entity type and effective date before treating a result as a legal conclusion.'});

export function evaluateBeneficialOwner(graph,{personId,entityId,rule=AUSTRALIA_GENERIC_25_CONTROL_RULE,maxDepth=8}={}){
  if(!(graph instanceof OwnershipGraph))throw new TypeError('graph must be an OwnershipGraph'); const person=graph.getNode(personId),entity=graph.getNode(entityId); if(!person||!entity)throw new Error('personId and entityId must reference existing nodes');
  const ownership=graph.ownershipSummary(personId,entityId,{maxDepth}),control=graph.controlSummary(personId,entityId,{maxDepth}),reasons=[],gaps=[];
  if(rule.requireIndividual&&person.kind!=='person')gaps.push('The evaluated owner is not represented as an individual/person node.');
  const ownershipQualifies=rule.ownershipThresholdPercentage!=null&&ownership.simplePathTotalPercentage>=rule.ownershipThresholdPercentage;
  if(ownershipQualifies)reasons.push({basis:'ownership',thresholdPercentage:rule.ownershipThresholdPercentage,computedPercentage:ownership.simplePathTotalPercentage,exact:ownership.exact});
  if(ownership.unknownPathCount)gaps.push(`${ownership.unknownPathCount} ownership path(s) contain an unknown percentage.`);
  const controlQualifies=Boolean(rule.controlQualifies&&control.hasControlPath); if(controlQualifies)reasons.push({basis:'control',verifiedPathAvailable:control.verifiedControlPath,pathCount:control.paths.length});
  const qualifies=(!rule.requireIndividual||person.kind==='person')&&(ownershipQualifies||controlQualifies); let status=qualifies?'qualifies':'does_not_qualify'; if(!qualifies&&(ownership.unknownPathCount||gaps.length))status='insufficient_evidence';
  return{moduleVersion:MODULE_VERSION,evaluatedAt:new Date().toISOString(),status,person:clone(person),entity:clone(entity),rule:clone(rule),reasons,gaps,ownership,control,reviewRequired:Boolean(ownership.warning||ownership.unknownPathCount||(controlQualifies&&!control.verifiedControlPath)||gaps.length),classification:{proposition:'beneficial-owner-rule-evaluation',epistemicClass:qualifies&&!ownership.warning&&!gaps.length?EpistemicClass.INFERENCE:EpistemicClass.UNKNOWN,note:'Recorded relationships remain separate from the rule-derived conclusion.'}};
}

export class MemoryCache{constructor(){this.map=new Map();}async get(k){const h=this.map.get(k);if(!h)return null;if(h.expiresAt&&Date.now()>h.expiresAt){this.map.delete(k);return null;}return clone(h.value);}async set(k,v,ttlMs=DEFAULT_TTL_MS){this.map.set(k,{value:clone(v),expiresAt:ttlMs?Date.now()+ttlMs:null});}async delete(k){this.map.delete(k);}async clear(){this.map.clear();}}
export class LocalStorageCache{constructor({namespace='bo-provenance'}={}){this.namespace=namespace;} _s(){if(!globalThis.localStorage)throw new Error('localStorage is not available');return globalThis.localStorage;} _k(k){return`${this.namespace}:${k}`;}async get(k){const raw=this._s().getItem(this._k(k));if(!raw)return null;const e=JSON.parse(raw);if(e.expiresAt&&Date.now()>e.expiresAt){this._s().removeItem(this._k(k));return null;}return e.value;}async set(k,v,ttlMs=DEFAULT_TTL_MS){this._s().setItem(this._k(k),JSON.stringify({value:v,expiresAt:ttlMs?Date.now()+ttlMs:null}));}async delete(k){this._s().removeItem(this._k(k));}async clear(){const s=this._s(),p=`${this.namespace}:`;for(let i=s.length-1;i>=0;i--){const k=s.key(i);if(k?.startsWith(p))s.removeItem(k);}}}
export function createDefaultCache(o={}){return o.preferLocalStorage!==false&&typeof globalThis.localStorage!=='undefined'?new LocalStorageCache(o):new MemoryCache();}
export async function createEvaluationCacheKey(graph,query,rule){return`evaluation:${await sha256({moduleVersion:MODULE_VERSION,graph:graph.snapshot(),query,rule})}`;}
export async function evaluateBeneficialOwnerCached(graph,query,{rule=AUSTRALIA_GENERIC_25_CONTROL_RULE,cache=createDefaultCache(),ttlMs=DEFAULT_TTL_MS}={}){const key=await createEvaluationCacheKey(graph,query,rule),hit=await cache.get(key);if(hit)return{...hit,cache:{hit:true,key}};const v=evaluateBeneficialOwner(graph,{...query,rule});await cache.set(key,v,ttlMs);return{...v,cache:{hit:false,key}};}

export const exportCanonicalGraph=graph=>graph.snapshot();
export const importCanonicalGraph=snapshot=>new OwnershipGraph(snapshot);
export function exportBodsLike(graph){return{profile:'BODS-inspired-0.4-transport',warning:'Validate against the official Open Ownership BODS schema when formal conformance is required.',statements:[...[...graph.nodes.values()].sort(byId).map(n=>({statementType:n.kind==='person'?'personStatement':'entityStatement',recordId:n.id,recordDetails:{name:n.name,identifiers:clone(n.identifiers),jurisdiction:n.jurisdiction,metadata:clone(n.metadata)}})),...[...graph.relationships.values()].sort(byId).map(r=>({statementType:'relationshipStatement',recordId:r.id,recordDetails:{interestedParty:r.from,subject:r.to,interests:[{type:r.interestType,share:r.percentage==null?null:{exact:r.percentage},directOrIndirect:r.directOrIndirect,beneficialOwnershipOrControl:r.beneficialOwnershipOrControl}],provenance:{evidence:clone(r.evidence),epistemicClass:r.epistemicClass,evidenceStatus:r.evidenceStatus,missingLink:r.missingLink}}}))]};}
export function importBodsLike(payload){const g=new OwnershipGraph(),ss=payload?.statements??[];for(const s of ss)if(s.statementType==='personStatement'||s.statementType==='entityStatement')g.addNode({id:s.recordId,kind:s.statementType==='personStatement'?'person':'entity',name:s.recordDetails?.name??s.recordId,identifiers:s.recordDetails?.identifiers??[],jurisdiction:s.recordDetails?.jurisdiction??null,metadata:s.recordDetails?.metadata??{}});for(const s of ss){if(s.statementType!=='relationshipStatement')continue;const i=s.recordDetails?.interests?.[0]??{};g.addRelationship({id:s.recordId,from:s.recordDetails?.interestedParty,to:s.recordDetails?.subject,interestType:i.type??InterestType.OTHER,percentage:i.share?.exact??null,directOrIndirect:i.directOrIndirect??'unknown',beneficialOwnershipOrControl:i.beneficialOwnershipOrControl??null,evidence:s.recordDetails?.provenance?.evidence??[],epistemicClass:s.recordDetails?.provenance?.epistemicClass??EpistemicClass.UNKNOWN,evidenceStatus:s.recordDetails?.provenance?.evidenceStatus??EvidenceStatus.UNKNOWN,missingLink:s.recordDetails?.provenance?.missingLink??null});}return g;}
