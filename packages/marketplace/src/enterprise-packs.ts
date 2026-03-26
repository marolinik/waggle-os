/**
 * Enterprise Packs — KVARK-conditional capability packs.
 *
 * These packs only appear when KVARK is connected (vault has 'kvark:connection').
 * They represent enterprise-grade capabilities that depend on KVARK's
 * semantic search, governance, and entity resolution subsystems.
 *
 * The skills referenced may not all exist yet — packs are metadata
 * that describe what will be available once KVARK features are fully wired.
 */

export interface EnterprisePack {
  slug: string;
  display_name: string;
  description: string;
  target_roles: string;
  icon: string;
  /** Skills included in this pack */
  skills: string[];
  /** Which KVARK features this pack requires */
  kvarkRequirements: string[];
}

export const ENTERPRISE_PACKS: EnterprisePack[] = [
  {
    slug: 'enterprise-document-qa',
    display_name: 'Enterprise Document Q&A',
    description: 'Ask questions across your organization\'s document library using KVARK\'s semantic search and retrieval pipeline',
    target_roles: 'knowledge-worker,analyst,researcher',
    icon: '\u{1F4DA}',
    skills: ['kvark_ask_document', 'kvark_search', 'document_summary'],
    kvarkRequirements: ['search', 'ask_document'],
  },
  {
    slug: 'compliance-workflow',
    display_name: 'Compliance Workflow',
    description: 'Governed document processing with audit trails — every action logged and traceable through KVARK\'s governance layer',
    target_roles: 'compliance,legal,admin',
    icon: '\u{1F6E1}\uFE0F',
    skills: ['kvark_action', 'audit_trail_query', 'compliance_check'],
    kvarkRequirements: ['governed_action'],
  },
  {
    slug: 'knowledge-graph-enrichment',
    display_name: 'Knowledge Graph Enrichment',
    description: 'Automatically link entities, extract relationships, and build knowledge graphs using KVARK\'s entity resolution',
    target_roles: 'researcher,analyst,knowledge-manager',
    icon: '\u{1F578}\uFE0F',
    skills: ['kvark_search', 'entity_extraction', 'relationship_mapping'],
    kvarkRequirements: ['search', 'entity_resolution'],
  },
];
