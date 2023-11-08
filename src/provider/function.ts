import { z } from "zod";
import * as restate from "@restatedev/restate-sdk";
import { ProvisioningStatus, Result } from "./common";
import * as functions from "../aws/lambda";
import * as iam from "@aws-sdk/client-iam";
import * as roles from "../aws/roles";
import * as lambda from "@aws-sdk/client-lambda";
import { RetrySettings } from "@restatedev/restate-sdk/dist/utils/public_utils";

const FunctionSchema = z.object({
  functionName: z.string(),
  code: z.string(),
  memoryMegabytes: z.number(),
  timeoutSeconds: z.number(),
});

type FunctionState = z.infer<typeof FunctionSchema>;

export const CreateFunctionSchema = FunctionSchema.extend({
  memoryMegabytes: z.number().optional(),
  timeoutSeconds: z.number().optional(),
});

const UpdateFunctionSchema = CreateFunctionSchema.partial().required({
  functionName: true,
});

export type CreateFunction = z.infer<typeof CreateFunctionSchema>;
export type UpdateFunction = z.infer<typeof UpdateFunctionSchema>;

const clientOpts = {
  region: process.env["AWS_REGION"],
};
const lambdaClient = new lambda.LambdaClient(clientOpts);
const iamClient = new iam.IAMClient(clientOpts);

enum State {
  STATUS = "status",
  STATE = "state",
}

const awsRetrySettings: RetrySettings = {
  initialDelayMs: 2000,
  maxRetries: 5,
};

export async function createFunction(ctx: restate.RpcContext, functionName: string, request: Object): Promise<Result> {
  console.log({ message: "Creating function", functionName, request });

  const validateResult = CreateFunctionSchema.safeParse({
    ...request,
    functionName,
  });
  if (!validateResult.success) {
    throw new restate.TerminalError("Validation error", validateResult.error);
  }
  const fn = validateResult.data;

  const rawStatus = (await ctx.get(State.STATUS)) as ProvisioningStatus | undefined | null;
  const status: ProvisioningStatus = rawStatus ?? ProvisioningStatus.NEW;

  switch (status) {
    case ProvisioningStatus.NEW:
      const roleArn = await ctx.sideEffect(
        () => roles.createRole(iamClient, "restate-fn-execution-role", functionName),
        awsRetrySettings,
      );
      const functionOutput = await ctx.sideEffect(
        () => functions.createLambdaFunction(lambdaClient, { ...fn, roleArn: roleArn }),
        awsRetrySettings,
      );

      ctx.set(State.STATUS, ProvisioningStatus.AVAILABLE);
      ctx.set(State.STATE, fn);

      return {
        success: true,
        reason: functionOutput.FunctionArn,
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

export async function updateFunction(ctx: restate.RpcContext, functionName: string, request: Object): Promise<Result> {
  console.log({ message: "Updating function", functionName, request });

  const validateResult = UpdateFunctionSchema.safeParse({
    ...request,
    functionName,
  });
  if (!validateResult.success) {
    throw new restate.TerminalError("Validation error", validateResult.error);
  }
  const updatedFunction = validateResult.data;

  const status = (await ctx.get(State.STATUS)) as ProvisioningStatus | null;

  if (status == null) {
    return {
      success: false,
      reason: `Not found: ${functionName}`,
    };
  } else if (status !== ProvisioningStatus.AVAILABLE) {
    return {
      success: false,
      reason: `Cannot update function in status: ${status}`,
    };
  }

  const existingFunction = (await ctx.get(State.STATE)) as CreateFunction | null;

  console.log({
    message: `Updating function ${functionName} in status ${status}.`,
    state: existingFunction,
    targetState: updatedFunction,
  });

  await ctx.sideEffect(async () => {
    await functions.updateLambdaCode(lambdaClient, updatedFunction, existingFunction);
  }, awsRetrySettings);

  await ctx.sideEffect(async () => {
    await functions.updateLambdaConfig(lambdaClient, updatedFunction, existingFunction);
  }, awsRetrySettings);

  ctx.set(State.STATE, updatedFunction);

  return {
    success: true,
  };
}

export async function deleteFunction(ctx: restate.RpcContext, functionName: string) {
  const status = (await ctx.get(State.STATUS)) as ProvisioningStatus | null;

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
        ctx.clear(State.STATUS);
      }
      return result;

    default:
      return {
        success: false,
        reason: `Cannot delete function in status: ${status}`,
      };
  }
}

export async function describeFunction(ctx: restate.RpcContext, functionName: string) {
  const status = (await ctx.get(State.STATUS)) as ProvisioningStatus | null;
  const state = (await ctx.get(State.STATE)) as FunctionState | null;

  if (status == null || state == null) {
    throw new restate.TerminalError(`No such function: ${functionName}`);
  } else if (status !== ProvisioningStatus.AVAILABLE) {
    throw new restate.TerminalError(`Cannot describe function in status: ${status}`);
  }

  return {
    success: true,
    status: status,
    configuration: state,
    // _awsConfiguration: ctx.sideEffect(
    //   async () => await lambdaClient.send(new lambda.GetFunctionCommand({ FunctionName: functionName })),
    // ),
  };
}

export const functionProvider = restate.keyedRouter({
  createFunction,
  updateFunction,
  deleteFunction,
  describeFunction,

  // Wouldn't this be neat? Restate could implement list for us by providing a simple state entry row mapper fn
  // listFunctions: restate.listHandler((ctx) => {
  //   return {
  //     functionName: ctx.get(State.STATE).functionName,
  //     status: ctx.get(State.STATUS),
  //   };
  // }),
});
