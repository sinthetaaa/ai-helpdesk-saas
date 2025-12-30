export const QUEUE_KB_INDEXING = "kb-indexing";

export const KB_JOBS = {
  INDEX_KB_SOURCE: "INDEX_KB_SOURCE",
} as const;

export type IndexKbSourcePayload = {
  tenantId: string;
  sourceId: string;
  requestedByUserId: string;
  mode?: "full" | "incremental";
};
