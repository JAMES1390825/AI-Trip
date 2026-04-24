const { createRunOncePlugin, withAppDelegate, withInfoPlist, withPodfile, WarningAggregator } = require("expo/config-plugins");
const { mergeContents } = require("@expo/config-plugins/build/utils/generateCode");
const pkg = require("../package.json");

const APP_DELEGATE_IMPORT_TAG = "amap-ios-import";
const APP_DELEGATE_INIT_TAG = "amap-ios-init";
const PODFILE_TAG = "amap-ios-pods";

function withAMapInfoPlist(config) {
  return withInfoPlist(config, (config) => {
    if (!config.modResults.NSAppTransportSecurity) {
      config.modResults.NSAppTransportSecurity = {};
    }
    config.modResults.NSAppTransportSecurity.NSAllowsArbitraryLoads = true;
    return config;
  });
}

function withAMapPodfile(config) {
  return withPodfile(config, (config) => {
    const podLines = [
      "pod 'react-native-amap-sdk/LocationAmap', :path => '../node_modules/@spatacus/react-native-amap-sdk/ios'",
      "pod 'react-native-amap-sdk/Map3dAmap', :path => '../node_modules/@spatacus/react-native-amap-sdk/ios'",
    ].join("\n");

    config.modResults.contents = mergeContents({
      src: config.modResults.contents,
      newSrc: podLines,
      tag: PODFILE_TAG,
      anchor: /use_expo_modules!/,
      offset: 1,
      comment: "#",
    }).contents;

    return config;
  });
}

function withAMapAppDelegate(config, { apiKey }) {
  return withAppDelegate(config, (config) => {
    if (!apiKey) {
      WarningAggregator.addWarningIOS(
        "withAMapIOS",
        "AMAP_API_KEY is not defined. iOS AMap SDK will be configured without a key and map rendering will fail.",
      );
      return config;
    }

    if (config.modResults.language !== "swift") {
      WarningAggregator.addWarningIOS(
        "withAMapIOS",
        `Unsupported AppDelegate language: ${config.modResults.language}. Only Swift AppDelegate is handled automatically.`,
      );
      return config;
    }

    config.modResults.contents = mergeContents({
      src: config.modResults.contents,
      newSrc: "import react_native_amap_sdk",
      tag: APP_DELEGATE_IMPORT_TAG,
      anchor: /import ReactAppDependencyProvider/,
      offset: 1,
      comment: "//",
    }).contents;

    config.modResults.contents = mergeContents({
      src: config.modResults.contents,
      newSrc: `    RNAMConfig.setAppKey("${apiKey}")`,
      tag: APP_DELEGATE_INIT_TAG,
      anchor: /let delegate = ReactNativeDelegate\(\)/,
      offset: 0,
      comment: "//",
    }).contents;

    return config;
  });
}

const withAMapIOS = (config, props = {}) => {
  config = withAMapInfoPlist(config);
  config = withAMapPodfile(config);
  config = withAMapAppDelegate(config, props);
  return config;
};

module.exports = createRunOncePlugin(withAMapIOS, "with-amap-ios", pkg.version);
