import { createDefaultPlanningJobService } from "../src/server/planning-job-service";
import { createPlanningJobWorker } from "../src/server/planning-job-worker";
import type { PlanningJobRecord } from "../src/server/planning-job-store";

type PlanningWorkerCliOptions = {
  argv: string[];
  executeJob: (id: string) => Promise<PlanningJobRecord | null>;
  write: (message: string) => void;
};

export async function runPlanningWorkerCli(options: PlanningWorkerCliOptions): Promise<number> {
  const eventIndex = options.argv.indexOf("--event");
  if (eventIndex >= 0) {
    const eventBody = options.argv[eventIndex + 1]?.trim();
    if (!eventBody) {
      options.write("Usage: npm run worker:planning -- --event '<planning-job-created-json>'");
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
    options.write("Usage: npm run worker:planning -- <planning-job-id> OR --event '<planning-job-created-json>'");
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
  const service = createDefaultPlanningJobService();
  const code = await runPlanningWorkerCli({
    argv: process.argv,
    executeJob: (id) => service.runJob(id),
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
