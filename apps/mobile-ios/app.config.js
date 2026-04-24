const fs = require("fs");
const path = require("path");
const appJson = require("./app.json");

function readEnvValue(key) {
  const candidates = [
    path.join(__dirname, "..", "..", ".env.local"),
    path.join(__dirname, "..", "..", ".env"),
    path.join(__dirname, "..", "..", "..", ".env.local"),
    path.join(__dirname, "..", "..", "..", ".env"),
    path.join(__dirname, "..", "..", "..", "..", ".env.local"),
    path.join(__dirname, "..", "..", "..", "..", ".env"),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, "utf8");
    const line = content
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${key}=`));
    if (!line) continue;
    const rawValue = line.slice(key.length + 1).trim();
    return rawValue.replace(/^['"]|['"]$/g, "");
  }

  return "";
}

module.exports = () => {
  const baseConfig = appJson.expo;
  const amapApiKey = process.env.AMAP_API_KEY || readEnvValue("AMAP_API_KEY") || "";

  return {
    ...baseConfig,
    plugins: [
      ...(baseConfig.plugins || []),
      [
        "./plugins/withAMapIOS",
        {
          apiKey: amapApiKey,
        },
      ],
    ],
  };
};
