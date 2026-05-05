import assert from "node:assert/strict";
import test from "node:test";
import { AmapClient, normalizeAmapPois } from "./amap-client";

const poiPayload = {
  status: "1",
  pois: [
    {
      id: "B0FFTEST01",
      name: "湖滨步行街",
      type: "购物服务;特色商业街;步行街",
      address: "湖滨路",
      location: "120.161421,30.255532",
      cityname: "杭州市"
    },
    {
      id: "B0FFTEST01",
      name: "湖滨步行街",
      type: "购物服务;特色商业街;步行街",
      address: "湖滨路",
      location: "120.161421,30.255532",
      cityname: "杭州市"
    }
  ]
};

test("normalizeAmapPois maps Amap POIs and deduplicates provider ids", () => {
  const pois = normalizeAmapPois(poiPayload, "杭州");

  assert.equal(pois.length, 1);
  assert.equal(pois[0].providerPoiId, "B0FFTEST01");
  assert.equal(pois[0].name, "湖滨步行街");
  assert.equal(pois[0].lng, 120.161421);
  assert.equal(pois[0].lat, 30.255532);
  assert.equal(pois[0].address, "湖滨路");
});

test("AmapClient.searchPois returns empty results without key", async () => {
  const client = new AmapClient({ key: "", fetcher: async () => new Response("{}") });

  const pois = await client.searchPois({ city: "杭州", keywords: "景点", slotId: "slot-1", limit: 5 });

  assert.deepEqual(pois, []);
});

test("AmapClient.estimateWalkingMinutes normalizes route duration seconds", async () => {
  const client = new AmapClient({
    key: "test-key",
    fetcher: async () => Response.json({ status: "1", route: { paths: [{ duration: "900" }] } })
  });

  const minutes = await client.estimateWalkingMinutes({ from: { lat: 30, lng: 120 }, to: { lat: 30.1, lng: 120.1 } });

  assert.equal(minutes, 15);
});
