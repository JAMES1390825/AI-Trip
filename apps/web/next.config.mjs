import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(repoRoot);

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false
};

export default nextConfig;
