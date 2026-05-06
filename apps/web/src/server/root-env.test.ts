import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { loadRootEnv } from "./root-env";

test("loadRootEnv loads provider keys from a repository root env file", async () => {
  const original = process.env.AMAP_WEB_SERVICE_KEY;
  delete process.env.AMAP_WEB_SERVICE_KEY;
  const dir = await mkdtemp(path.join(tmpdir(), "root-env-"));
  try {
    await writeFile(path.join(dir, ".env"), "AMAP_WEB_SERVICE_KEY=test-amap-key\n");

    loadRootEnv(dir);

    assert.equal(process.env.AMAP_WEB_SERVICE_KEY, "test-amap-key");
  } finally {
    if (original === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = original;
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadRootEnv keeps already provided runtime env values", async () => {
  const original = process.env.AMAP_WEB_SERVICE_KEY;
  process.env.AMAP_WEB_SERVICE_KEY = "runtime-key";
  const dir = await mkdtemp(path.join(tmpdir(), "root-env-"));
  try {
    await writeFile(path.join(dir, ".env"), "AMAP_WEB_SERVICE_KEY=file-key\n");

    loadRootEnv(dir);

    assert.equal(process.env.AMAP_WEB_SERVICE_KEY, "runtime-key");
  } finally {
    if (original === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = original;
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadRootEnv default call skips repository env during node tests", () => {
  const original = process.env.AMAP_WEB_SERVICE_KEY;
  delete process.env.AMAP_WEB_SERVICE_KEY;
  try {
    loadRootEnv();

    assert.equal(process.env.AMAP_WEB_SERVICE_KEY, undefined);
  } finally {
    if (original === undefined) delete process.env.AMAP_WEB_SERVICE_KEY;
    else process.env.AMAP_WEB_SERVICE_KEY = original;
  }
});
