import { createDefaultPlanningJobService } from "../src/server/planning-job-service";

type PlanningWorkerCliOptions = {
  argv: string[];
  executeJob: (id: string) => Promise<{ status: string } | null>;
  write: (message: string) => void;
};

export async function runPlanningWorkerCli(options: PlanningWorkerCliOptions): Promise<number> {
  const jobId = options.argv[2]?.trim();
  if (!jobId) {
    options.write("Usage: npm run worker:planning -- <planning-job-id>");
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
