import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { readProductionEnv } from "./production-env";

export type VectorCollectionName =
  | "travel_evidence_chunks"
  | "poi_semantic_profiles"
  | "user_travel_memories"
  | "itinerary_summaries";

export type VectorPostgresRef = {
  type: "evidence_source" | "poi_snapshot" | "user_memory" | "trip" | "itinerary_version";
  id: string;
};

export type VectorDocument = {
  id: string;
  collection: VectorCollectionName;
  vector: number[];
  text: string;
  postgresRef: VectorPostgresRef;
  metadata?: Record<string, unknown>;
};

export type VectorSearchRequest = {
  collection: VectorCollectionName;
  vector: number[];
  limit: number;
  filter?: string;
};

export type VectorSearchResult = {
  id: string;
  score: number;
  text: string;
  postgresRef: VectorPostgresRef;
};

type MilvusInsertResult = {
  insert_cnt?: number;
};

type MilvusSearchResult = {
  results?: Array<Record<string, unknown>>;
};

export type MilvusLikeClient = {
  insert(payload: unknown): Promise<MilvusInsertResult>;
  search(payload: unknown): Promise<MilvusSearchResult>;
};

export type VectorStore = {
  upsert(document: VectorDocument): Promise<void>;
  search(request: VectorSearchRequest): Promise<VectorSearchResult[]>;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export function createMilvusVectorStore(client: MilvusLikeClient): VectorStore {
  return {
    async upsert(document) {
      await client.insert({
        collection_name: document.collection,
        data: [
          {
            id: document.id,
            vector: document.vector,
            text: document.text,
            postgres_ref_type: document.postgresRef.type,
            postgres_ref_id: document.postgresRef.id,
            metadata_json: JSON.stringify(document.metadata || {})
          }
        ]
      });
    },
    async search(request) {
      const response = await client.search({
        collection_name: request.collection,
        data: [request.vector],
        limit: request.limit,
        filter: request.filter,
        output_fields: ["id", "text", "postgres_ref_type", "postgres_ref_id"]
      });

      return (response.results || []).map((item) => ({
        id: asString(item.id),
        score: asNumber(item.score),
        text: asString(item.text),
        postgresRef: {
          type: asString(item.postgres_ref_type) as VectorPostgresRef["type"],
          id: asString(item.postgres_ref_id)
        }
      }));
    }
  };
}

export function createMilvusClientFromEnv(env = readProductionEnv()): MilvusClient {
  return new MilvusClient({
    address: env.milvus.address,
    username: env.milvus.username,
    password: env.milvus.password,
    database: env.milvus.database
  });
}
