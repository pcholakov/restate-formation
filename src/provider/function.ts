import { z } from "zod";
import * as restate from "@restatedev/restate-sdk";
import { ProvisioningStatus, Result } from "./common";
import * as functions from "../aws/functions";
import * as iam from "@aws-sdk/client-iam";
import * as roles from "../aws/roles";
import * as lambda from "@aws-sdk/client-lambda";

const CreateFunctionSchema = z.object({
  functionName: z.string(),
  code: z.string(),
  memoryMegabytes: z.number().optional(),
  timeoutSeconds: z.number().optional(),
  logRetentionDays: z.number().optional(),
});

const UpdateFunctionSchema = CreateFunctionSchema.extend({
  code: CreateFunctionSchema.shape.code.optional(),
});

export type CreateCloudFunction = z.infer<typeof CreateFunctionSchema>;
export type UpdateCloudFunction = z.infer<typeof UpdateFunctionSchema>;

const clientOpts = {
  region: process.env["AWS_REGION"],
};
const lambdaClient = new lambda.LambdaClient(clientOpts);
const iamClient = new iam.IAMClient(clientOpts);

async function createFunction(ctx: restate.RpcContext, functionName: string, request: Object): Promise<Result> {
  console.log({ message: "Creating function", functionName, request });

  const validateResult = CreateFunctionSchema.safeParse({
    ...request,
    functionName,
  });
  if (!validateResult.success) {
    throw new restate.TerminalError("Validation error", validateResult.error);
  }
  const fn = validateResult.data;

  const rawStatus = (await ctx.get("status")) as ProvisioningStatus | undefined | null;
  const status: ProvisioningStatus = rawStatus ?? ProvisioningStatus.NEW;

  switch (status) {
    case ProvisioningStatus.NEW:
      const roleArn = await ctx.sideEffect(() =>
        roles.createRole(iamClient, "restate-fn-execution-role", functionName),
      );
      const functionOutput = await ctx.sideEffect(() =>
        functions.createLambdaFunction(lambdaClient, { ...fn, roleArn: roleArn }),
      );

      ctx.set("status", ProvisioningStatus.AVAILABLE);
      ctx.set("state", fn);

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

async function updateFunction(ctx: restate.RpcContext, functionName: string, request: Object): Promise<Result> {
  console.log({ message: "Updating function", functionName, request });

  const validateResult = UpdateFunctionSchema.safeParse({
    ...request,
    functionName,
  });
  if (!validateResult.success) {
    throw new restate.TerminalError("Validation error", validateResult.error);
  }
  const updatedFunction = validateResult.data;

  const status = (await ctx.get("status")) as ProvisioningStatus | null;

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

  const existingFunction = (await ctx.get("state")) as CreateCloudFunction | null;

  console.log({
    message: `Updating function ${functionName} in status ${status}.`,
    state: existingFunction,
    targetState: updatedFunction,
  });

  await ctx.sideEffect(() => functions.updateLambdaFunction(lambdaClient, updatedFunction, existingFunction));
  ctx.set("state", updatedFunction);

  return {
    success: true,
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

export const functionProvider = restate.keyedRouter({
  createFunction,
  updateFunction,
  deleteFunction,
  describeFunction,

  // Wouldn't this be neat? Restate could implement list for us by providing a simple state entry row mapper fn
  // listFunctions: restate.listHandler((ctx) => {
  //   functionName: ctx.get("state").functionName,
  //       status: ctx.get("status"),
  // }),
});
