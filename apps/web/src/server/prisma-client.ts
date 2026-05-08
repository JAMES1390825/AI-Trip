import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client";
import { readProductionEnv } from "./production-env";

let prismaClient: PrismaClient | undefined;
let pgPool: Pool | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prismaClient) {
    pgPool = new Pool({
      connectionString: readProductionEnv().databaseUrl
    });
    prismaClient = new PrismaClient({
      adapter: new PrismaPg(pgPool)
    });
  }
  return prismaClient;
}

export async function disconnectPrismaClientForTests(): Promise<void> {
  await prismaClient?.$disconnect();
  await pgPool?.end();
  prismaClient = undefined;
  pgPool = undefined;
}
