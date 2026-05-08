import assert from "node:assert/strict";
import test from "node:test";
import { createMilvusVectorStore, type VectorDocument } from "./vector-store";

class FakeMilvusClient {
  public inserted: unknown[] = [];
  public searches: unknown[] = [];

  async insert(payload: unknown): Promise<{ insert_cnt: number }> {
    this.inserted.push(payload);
    return { insert_cnt: 1 };
  }

  async search(payload: unknown): Promise<{ results: Array<Record<string, unknown>> }> {
    this.searches.push(payload);
    return {
      results: [
        {
          id: "vec-1",
          score: 0.92,
          postgres_ref_type: "evidence_source",
          postgres_ref_id: "evidence-1",
          text: "西湖适合清晨步行"
        }
      ]
    };
  }
}

test("createMilvusVectorStore upserts vectors with PostgreSQL reference metadata", async () => {
  const client = new FakeMilvusClient();
  const store = createMilvusVectorStore(client);
  const document: VectorDocument = {
    id: "vec-1",
    collection: "travel_evidence_chunks",
    vector: [0.1, 0.2, 0.3],
    text: "西湖适合清晨步行",
    postgresRef: {
      type: "evidence_source",
      id: "evidence-1"
    },
    metadata: {
      city: "杭州"
    }
  };

  await store.upsert(document);

  assert.deepEqual(client.inserted[0], {
    collection_name: "travel_evidence_chunks",
    data: [
      {
        id: "vec-1",
        vector: [0.1, 0.2, 0.3],
        text: "西湖适合清晨步行",
        postgres_ref_type: "evidence_source",
        postgres_ref_id: "evidence-1",
        metadata_json: JSON.stringify({ city: "杭州" })
      }
    ]
  });
});

test("createMilvusVectorStore normalizes search results back to business refs", async () => {
  const client = new FakeMilvusClient();
  const store = createMilvusVectorStore(client);

  const results = await store.search({
    collection: "travel_evidence_chunks",
    vector: [0.1, 0.2, 0.3],
    limit: 5,
    filter: 'city == "杭州"'
  });

  assert.deepEqual(client.searches[0], {
    collection_name: "travel_evidence_chunks",
    data: [[0.1, 0.2, 0.3]],
    limit: 5,
    filter: 'city == "杭州"',
    output_fields: ["id", "text", "postgres_ref_type", "postgres_ref_id"]
  });
  assert.deepEqual(results, [
    {
      id: "vec-1",
      score: 0.92,
      text: "西湖适合清晨步行",
      postgresRef: {
        type: "evidence_source",
        id: "evidence-1"
      }
    }
  ]);
});
