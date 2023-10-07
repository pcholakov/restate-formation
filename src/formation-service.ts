import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import * as commons from "./common-resources";
import * as functions from "./functions";

const FunctionSchema = z.object({
  functionName: z.string(),
  code: z.string(),
  memoryMegabytes: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  logRetentionDays: z.number().optional(),
});

export type CloudFunction = {
  functionName: string;
  code: string;
  memoryMegabytes?: number;
  timeoutSeconds?: number;
  logRetentionDays?: number;
};

export type Result = { success: boolean; reason?: string };

enum ProvisioningStatus {
  NEW = 0,
  PROVISIONING = 1,
  STABLE = 2,
  FAILED = 3,
  DELETED = 4,
}

async function createFunction(ctx: restate.RpcContext, functionName: string, request: Object): Promise<Result> {
  console.log({ message: "Creating function", functionName, request });

  const validateResult = FunctionSchema.safeParse({
    ...request,
    functionName,
  });
  if (!validateResult.success) {
    throw new restate.TerminalError("Validation error:", validateResult.error);
  }
  const fn = validateResult.data satisfies CloudFunction;

  const status: ProvisioningStatus = (await ctx.get("status")) ?? ProvisioningStatus.NEW;

  switch (status) {
    case (ProvisioningStatus.NEW, ProvisioningStatus.DELETED):
      ctx.set("status", ProvisioningStatus.PROVISIONING);
      const roleArn = await ctx.rpc<commons.API>({ path: "commons" }).createRole("execution-role");

      const result = await ctx
        .rpc<functions.API>({ path: "functions" })
        .createFunction(functionName, { ...fn, roleArn });

      ctx.set("status", ProvisioningStatus.STABLE);
      return result;

    case ProvisioningStatus.PROVISIONING:
      return {
        success: false,
        reason: "This function is busy updating. Please try again later.",
      };

    case ProvisioningStatus.STABLE:
      return {
        success: false,
        reason: "This function is in a terminal state. Create a new one.",
      };

    default:
      throw new restate.TerminalError(`Unexpected status: ${status}`);
  }
}

async function deleteFunction(ctx: restate.RpcContext, functionName: string) {
  const status: ProvisioningStatus = (await ctx.get("status")) ?? ProvisioningStatus.NEW;
  switch (status) {
    case ProvisioningStatus.STABLE:
      const result = await ctx.rpc<functions.API>({ path: "functions" }).deleteFunction(functionName);
      if (result.success) {
        ctx.set("status", ProvisioningStatus.DELETED);
      }
      return result;

    default:
      return {
        success: false,
        reason: `Cannot delete function in status: ${status}`,
      };
  }
}

async function cleanupFailed(ctx: restate.RpcContext, functionName: string) {
  if ((await ctx.get("status")) === ProvisioningStatus.FAILED) {
    ctx.rpc<API>({ path: "provisioning" }).deleteFunction(functionName);
  }
}

const formationRouter = restate.keyedRouter({
  createFunction,
  deleteFunction,
  cleanupFailed,
});

type API = typeof formationRouter;

restate
  .createServer()
  .bindKeyedRouter("formation", formationRouter)
  .bindKeyedRouter("functions", functions.router)
  .bindRouter("commons", commons.router)
  .listen(8080);
