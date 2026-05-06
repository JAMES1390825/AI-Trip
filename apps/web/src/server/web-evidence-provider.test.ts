import assert from "node:assert/strict";
import test from "node:test";
import {
  ExaWebEvidenceProvider,
  NullWebEvidenceProvider,
  createWebEvidenceProvider,
  normalizeExaEvidence
} from "./web-evidence-provider";

test("NullWebEvidenceProvider returns no evidence", async () => {
  const provider = new NullWebEvidenceProvider();

  const evidence = await provider.searchEvidence({
    city: "杭州",
    query: "西湖预约",
    stopNames: ["西湖", "灵隐寺"],
    usedFor: "reservation"
  });

  assert.deepEqual(evidence, []);
});

test("normalizeExaEvidence maps title url source and snippet", () => {
  const evidence = normalizeExaEvidence(
    {
      results: [
        {
          title: "西湖景区预约攻略",
          url: "https://example.com/xihu",
          author: "杭州文旅",
          highlights: ["提前预约热门景点"],
          summary: "官方建议错峰游览。",
          publishedDate: "2026-03-01"
        }
      ]
    },
    "risk"
  );

  assert.deepEqual(evidence, [
    {
      title: "西湖景区预约攻略",
      url: "https://example.com/xihu",
      sourceName: "杭州文旅",
      snippet: "提前预约热门景点",
      usedFor: "risk",
      publishedDate: "2026-03-01"
    }
  ]);
});

test("ExaWebEvidenceProvider calls Exa Search with x-api-key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const provider = new ExaWebEvidenceProvider({
    apiKey: "test-exa-key",
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        results: [
          {
            title: "杭州避坑指南",
            url: "https://example.com/hangzhou",
            source: "Example",
            summary: "雨天建议安排室内备选。"
          }
        ]
      });
    }
  });

  const evidence = await provider.searchEvidence({
    city: "杭州",
    query: "亲子路线",
    stopNames: ["西湖", "灵隐寺", "河坊街", "中国茶叶博物馆", "良渚博物院"],
    usedFor: "context"
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.exa.ai/search");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal((calls[0].init?.headers as Record<string, string>)["content-type"], "application/json");
  assert.equal((calls[0].init?.headers as Record<string, string>)["x-api-key"], "test-exa-key");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    query: "杭州 亲子路线 西湖 灵隐寺 河坊街 中国茶叶博物馆 旅行攻略 避坑 预约",
    type: "auto",
    numResults: 5,
    contents: { highlights: true, summary: true }
  });
  assert.equal(evidence[0].title, "杭州避坑指南");
});

test("createWebEvidenceProvider returns Exa only when configured", () => {
  assert.ok(createWebEvidenceProvider({ SEARCH_PROVIDER: "", EXA_API_KEY: "" }) instanceof NullWebEvidenceProvider);
  assert.ok(createWebEvidenceProvider({ SEARCH_PROVIDER: "exa", EXA_API_KEY: "" }) instanceof NullWebEvidenceProvider);
  assert.ok(createWebEvidenceProvider({ SEARCH_PROVIDER: "exa", EXA_API_KEY: "test-key" }) instanceof ExaWebEvidenceProvider);
});
