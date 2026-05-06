export type AmapJsApi = {
  Map: new (...args: unknown[]) => unknown;
  Marker?: new (...args: unknown[]) => unknown;
  Polyline?: new (...args: unknown[]) => unknown;
  LngLat?: new (...args: unknown[]) => unknown;
  Bounds?: new (...args: unknown[]) => unknown;
  Pixel?: new (...args: unknown[]) => unknown;
};

export type AmapWindow = Window & {
  AMap?: AmapJsApi;
  _AMapSecurityConfig?: { securityJsCode: string };
};

export type AmapJsApiLoaderConfig = {
  apiKey: string;
  securityJsCode?: string;
};

let loadingPromise: Promise<AmapJsApi> | null = null;

export function __resetAmapLoaderForTests() {
  loadingPromise = null;
}

function getBrowserWindow(): AmapWindow | null {
  if (typeof window === "undefined") return null;
  return window as AmapWindow;
}

export function loadAmapJsApi(config: AmapJsApiLoaderConfig): Promise<AmapJsApi> {
  const apiKey = config.apiKey.trim();
  const securityJsCode = config.securityJsCode?.trim();

  if (!apiKey) return Promise.reject(new Error("AMAP_JS_API_KEY_MISSING"));

  const browserWindow = getBrowserWindow();
  if (!browserWindow || typeof document === "undefined") {
    return Promise.reject(new Error("AMAP_BROWSER_UNAVAILABLE"));
  }

  if (browserWindow.AMap) return Promise.resolve(browserWindow.AMap);
  if (loadingPromise) return loadingPromise;

  if (securityJsCode) {
    browserWindow._AMapSecurityConfig = { securityJsCode };
  }

  loadingPromise = new Promise<AmapJsApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(apiKey)}`;
    script.onload = () => {
      if (browserWindow.AMap) {
        resolve(browserWindow.AMap);
        return;
      }
      loadingPromise = null;
      reject(new Error("AMAP_JS_API_NOT_READY"));
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error("AMAP_JS_API_LOAD_FAILED"));
    };
    document.head.appendChild(script);
  });

  return loadingPromise;
}
