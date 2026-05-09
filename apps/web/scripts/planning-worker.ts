import { createDefaultPlanningJobService } from "../src/server/planning-job-service";
import {
  createPlanningJobConsumerDaemon,
  createRocketMqPlanningJobConsumer,
  type PlanningJobConsumerRunSummary
} from "../src/server/planning-job-consumer";
import { createPlanningJobWorker } from "../src/server/planning-job-worker";
import type { PlanningJobRecord } from "../src/server/planning-job-store";
import { readProductionEnv } from "../src/server/production-env";
import { loadRootEnv } from "../src/server/root-env";

type StoppablePlanningDaemon = {
  stop(): Promise<void>;
};

type SignalTarget = {
  once(signal: NodeJS.Signals, handler: () => void): void;
  off(signal: NodeJS.Signals, handler: () => void): void;
};

type PlanningWorkerCliOptions = {
  argv: string[];
  executeJob: (id: string) => Promise<PlanningJobRecord | null>;
  runDaemon?: (options: { maxBatches?: number }) => Promise<PlanningJobConsumerRunSummary>;
  write: (message: string) => void;
};

function usage(): string {
  return [
    "Usage:",
    "npm run worker:planning -- <planning-job-id>",
    "npm run worker:planning -- --event '<planning-job-created-json>'",
    "npm run worker:planning -- --daemon [--max-batches <positive-integer>]"
  ].join("\n");
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  const value = argv[index + 1]?.trim();
  return value || undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function installPlanningWorkerSignalHandlers(
  daemon: StoppablePlanningDaemon,
  target: SignalTarget = process,
): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  const handlers = signals.map((signal) => {
    const handler = () => {
      void daemon.stop();
    };
    target.once(signal, handler);
    return { signal, handler };
  });

  return () => {
    for (const { signal, handler } of handlers) target.off(signal, handler);
  };
}

export async function runPlanningWorkerCli(options: PlanningWorkerCliOptions): Promise<number> {
  if (options.argv.includes("--daemon")) {
    if (!options.runDaemon) {
      options.write("Planning daemon runner is not configured.");
      return 1;
    }
    const maxBatches = parsePositiveInteger(valueAfter(options.argv, "--max-batches"));
    if (maxBatches === null) {
      options.write("--max-batches must be a positive integer.");
      return 1;
    }

    options.write("Planning daemon starting...");
    const summary = await options.runDaemon({ maxBatches });
    options.write(
      `Planning daemon stopped: ${summary.batches} batches, ${summary.received} received, ` +
        `${summary.acknowledged} acknowledged, ${summary.failed} failed`,
    );
    return summary.failed > 0 ? 2 : 0;
  }

  const eventIndex = options.argv.indexOf("--event");
  if (eventIndex >= 0) {
    const eventBody = options.argv[eventIndex + 1]?.trim();
    if (!eventBody) {
      options.write(usage());
      return 1;
    }
    const worker = createPlanningJobWorker({
      service: {
        async createJob() {
          throw new Error("not used");
        },
        async getJob() {
          throw new Error("not used");
        },
        runJob: options.executeJob
      }
    });
    const result = await worker.handleEvent(eventBody);
    if (result.status === "ignored") {
      options.write(`Planning event ignored: ${result.reason}`);
      return 1;
    }
    if (result.status === "not_found") {
      options.write(`Planning job not found: ${result.jobId}`);
      return 1;
    }
    if (result.status === "failed") {
      options.write(`Planning event ${result.jobId} failed: ${result.errorCode}`);
      return 2;
    }
    options.write(`Planning event ${result.jobId} processed: ${result.jobStatus}`);
    return 0;
  }

  const jobId = options.argv[2]?.trim();
  if (!jobId) {
    options.write(usage());
    return 1;
  }

  const job = await options.executeJob(jobId);
  if (!job) {
    options.write(`Planning job not found: ${jobId}`);
    return 1;
  }

  options.write(`Planning job ${jobId} ${job.status}`);
  return job.status === "failed" ? 2 : 0;
}

async function main(): Promise<void> {
  loadRootEnv();
  const service = createDefaultPlanningJobService();

  const code = await runPlanningWorkerCli({
    argv: process.argv,
    executeJob: (id) => service.runJob(id),
    runDaemon: async (options) => {
      const worker = createPlanningJobWorker({ service });
      const env = readProductionEnv();
      const consumer = createRocketMqPlanningJobConsumer(env);
      const daemon = createPlanningJobConsumerDaemon({ consumer, worker });
      const cleanupSignals = installPlanningWorkerSignalHandlers(daemon);
      try {
        return await daemon.run(options);
      } finally {
        cleanupSignals();
      }
    },
    write: (message) => console.log(message)
  });
  process.exitCode = code;
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
