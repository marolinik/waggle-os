// Types for hive query results — DB queries live in the server's MessageService
export interface HiveQueryResult {
  entities: Array<{
    id: string;
    name: string;
    entityType: string;
    properties: Record<string, unknown>;
  }>;
  relatedTasks: Array<{
    id: string;
    title: string;
    status: string;
    createdBy: string;
  }>;
  relatedMessages: Array<{
    id: string;
    type: string;
    subtype: string;
    content: Record<string, unknown>;
  }>;
}

export interface HiveQuery {
  topic: string;
  scope?: string;
}
