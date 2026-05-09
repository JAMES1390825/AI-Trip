import { Message, Producer } from "rocketmq-client-nodejs";
import { readProductionEnv } from "./production-env";

export type PlanningJobCreatedEvent = {
  type: "planning.job.created";
  jobId: string;
  tripId?: string;
  idempotencyKey?: string;
  requestedAt: string;
};

export type PlanningQueue = {
  publishPlanningJobCreated(event: PlanningJobCreatedEvent): Promise<string>;
};

export type PlanningQueueOptions = {
  topicPlanning: string;
};

export type RocketMqProducerLike = {
  send(message: unknown): Promise<{ messageId?: string }>;
};

function keysFor(event: PlanningJobCreatedEvent): string[] {
  return [event.jobId, event.tripId, event.idempotencyKey].filter((key): key is string => Boolean(key));
}

export function createRocketMqPlanningQueue(
  producer: RocketMqProducerLike,
  options: PlanningQueueOptions,
): PlanningQueue {
  return {
    async publishPlanningJobCreated(event) {
      const receipt = await producer.send({
        topic: options.topicPlanning,
        tag: event.type,
        keys: keysFor(event),
        body: Buffer.from(JSON.stringify(event))
      });
      return receipt.messageId || "";
    }
  };
}

export function createRocketMqProducerFromEnv(env = readProductionEnv()): Producer {
  const sessionCredentials = env.rocketmq.accessKey && env.rocketmq.secretKey
    ? {
        accessKey: env.rocketmq.accessKey,
        accessSecret: env.rocketmq.secretKey
      }
    : undefined;

  return new Producer({
    endpoints: env.rocketmq.endpoints,
    namespace: env.rocketmq.namespace,
    topics: [env.rocketmq.topicPlanning],
    sessionCredentials
  });
}

export function toRocketMqMessage(
  event: PlanningJobCreatedEvent,
  options: PlanningQueueOptions,
): Message {
  return new Message({
    topic: options.topicPlanning,
    tag: event.type,
    keys: keysFor(event),
    body: Buffer.from(JSON.stringify(event))
  });
}
