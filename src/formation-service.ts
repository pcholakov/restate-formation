import * as iam from "@aws-sdk/client-iam";
import * as lambda from "@aws-sdk/client-lambda";
import * as restate from "@restatedev/restate-sdk";
import { z } from "zod";
import * as functions from "./resources/functions";
import * as roles from "./resources/roles";

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
  NEW = "NEW",
  PROVISIONING = "PROVISIONING",
  AVAILABLE = "AVAILABLE",
  FAILED = "FAILED",
}

const clientOpts = {
  region: process.env["AWS_REGION"],
};
const lambdaClient = new lambda.LambdaClient(clientOpts);
const iamClient = new iam.IAMClient(clientOpts);

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

  const rawStatus = (await ctx.get("status")) as ProvisioningStatus | undefined | null;
  const status: ProvisioningStatus = rawStatus ?? ProvisioningStatus.NEW;
  console.log({ message: `Function ${functionName} is in status ${status} (rawStatus: ${rawStatus})` });

  switch (status) {
    case ProvisioningStatus.NEW:
      console.log({ message: "Transitioning to provisioning ..." });
      ctx.set("status", ProvisioningStatus.PROVISIONING);

      const roleArn = await ctx.sideEffect(() => roles.createRole(iamClient, "restate-fn-execution-role"));
      const functionOutput = await ctx.sideEffect(() =>
        functions.createLambdaFunction(lambdaClient, { ...fn, roleArn: roleArn }),
      );

      ctx.set("status", ProvisioningStatus.AVAILABLE);
      return {
        success: true,
        reason: functionOutput.FunctionArn,
      };

    case ProvisioningStatus.PROVISIONING:
      return {
        success: false,
        reason: "This function is busy updating. Please try again later.",
      };

    case ProvisioningStatus.AVAILABLE:
      return {
        success: false,
        reason: "This function is already in a stable state. Please use update instead.",
      };

    default:
      throw new restate.TerminalError(`Unexpected status: ${status}`);
  }
}

async function describeFunction(ctx: restate.RpcContext, functionName: string) {
  const status = (await ctx.get("status")) as ProvisioningStatus | null;

  if (status == null) {
    throw new restate.TerminalError(`No such function: ${functionName}`);
  } else if (status !== ProvisioningStatus.AVAILABLE) {
    throw new restate.TerminalError(`Cannot describe function in status: ${status}`);
  }

  const fn = await lambdaClient.send(new lambda.GetFunctionCommand({ FunctionName: functionName }));
  return {
    success: true,
    status: status,
    configuration: {
      Configuration: fn.Configuration,
    },
  };
}

async function deleteFunction(ctx: restate.RpcContext, functionName: string) {
  const status = (await ctx.get("status")) as ProvisioningStatus | null;

  console.log({ message: `Deleting function ${functionName} in status ${status}` });

  if (status == null) {
    return {
      success: false,
      reason: `Not found: ${functionName}`,
    };
  }

  switch (status) {
    case ProvisioningStatus.AVAILABLE:
      const result = await ctx.sideEffect(() => functions.deleteLambdaFunction(lambdaClient, functionName));
      if (result.success) {
        ctx.clear("status");
      }
      return result;

    default:
      return {
        success: false,
        reason: `Cannot delete function in status: ${status}`,
      };
  }
}

const formationRouter = restate.keyedRouter({
  createFunction,
  deleteFunction,
  describeFunction,
});

restate.createServer().bindKeyedRouter("formation", formationRouter).listen(8080);
