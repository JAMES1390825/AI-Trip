import assert from "node:assert/strict";
import test from "node:test";
import {
  __resetAmapLoaderForTests,
  loadAmapJsApi,
  type AmapJsApiLoaderConfig,
  type AmapWindow
} from "./amap-js-loader";

function installDomStub() {
  const appended: Array<Record<string, unknown>> = [];
  const documentStub = {
    createElement(tagName: string) {
      assert.equal(tagName, "script");
      return {
        async: false,
        src: "",
        onerror: null as null | (() => void),
        onload: null as null | (() => void)
      };
    },
    head: {
      appendChild(element: Record<string, unknown>) {
        appended.push(element);
      }
    }
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub
  });

  return appended;
}

function installWindowStub(overrides: Partial<AmapWindow> = {}) {
  const windowStub = {
    AMap: undefined,
    _AMapSecurityConfig: undefined,
    ...overrides
  } as unknown as AmapWindow;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub
  });

  return windowStub;
}

test.afterEach(() => {
  __resetAmapLoaderForTests();
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { document?: unknown }).document;
});

test("loadAmapJsApi rejects when JSAPI key is missing", async () => {
  await assert.rejects(
    () => loadAmapJsApi({ apiKey: "", securityJsCode: "secret" }),
    /AMAP_JS_API_KEY_MISSING/
  );
});

test("loadAmapJsApi sets security config and reuses the same loading promise", async () => {
  const appended = installDomStub();
  const windowStub = installWindowStub();
  const config: AmapJsApiLoaderConfig = { apiKey: "test-key", securityJsCode: "test-security" };

  const first = loadAmapJsApi(config);
  const second = loadAmapJsApi(config);

  assert.equal(first, second);
  assert.equal(appended.length, 1);
  assert.deepEqual(windowStub._AMapSecurityConfig, { securityJsCode: "test-security" });

  const script = appended[0] as { onload: null | (() => void); src: string };
  assert.match(script.src, /webapi\.amap\.com\/maps\?v=2\.0/);
  assert.match(script.src, /key=test-key/);

  windowStub.AMap = { Map: class {} };
  script.onload?.();

  assert.equal(await first, windowStub.AMap);
});

test("loadAmapJsApi rejects cleanly on script load failure", async () => {
  const appended = installDomStub();
  installWindowStub();

  const promise = loadAmapJsApi({ apiKey: "test-key", securityJsCode: "test-security" });
  const script = appended[0] as { onerror: null | (() => void) };
  script.onerror?.();

  await assert.rejects(() => promise, /AMAP_JS_API_LOAD_FAILED/);
});
