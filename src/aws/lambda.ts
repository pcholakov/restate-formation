import * as lambda from "@aws-sdk/client-lambda";
import JSZip from "jszip";
import { Result } from "../provider/common";
import { CreateFunction, UpdateFunction } from "../provider/function";

export async function createLambdaFunction(
  lambdaClient: lambda.LambdaClient,
  fn: CreateFunction & {
    roleArn: string;
  },
) {
  return await lambdaClient.send(
    new lambda.CreateFunctionCommand({
      FunctionName: fn.functionName,
      Code: {
        ZipFile: await generateCodeZip(fn.code),
      },
      Handler: "index.handler",
      Role: fn.roleArn,
      Runtime: lambda.Runtime.nodejs18x,
      MemorySize: fn.memoryMegabytes,
      Timeout: fn.timeoutSeconds,
      Architectures: [lambda.Architecture.arm64],
    }),
  );
}

export async function updateLambdaCode(
  lambdaClient: lambda.LambdaClient,
  fn: UpdateFunction,
  existingState: CreateFunction | null,
) {
  if (fn.code && fn.code !== existingState?.code) {
    console.log("Updating function code ...");

    await lambdaClient.send(
      new lambda.UpdateFunctionCodeCommand({
        FunctionName: fn.functionName,
        ZipFile: await generateCodeZip(fn.code),
      }),
    );
  }
}

export async function updateLambdaConfig(
  lambdaClient: lambda.LambdaClient,
  fn: UpdateFunction,
  existingState: CreateFunction | null,
) {
  if (fn.memoryMegabytes !== existingState?.memoryMegabytes || fn.timeoutSeconds !== existingState?.timeoutSeconds) {
    console.log("Updating function configuration ...");

    await lambdaClient.send(
      new lambda.UpdateFunctionConfigurationCommand({
        FunctionName: fn.functionName,
        MemorySize: fn.memoryMegabytes,
        Timeout: fn.timeoutSeconds,
      }),
    );
  }
}

export async function deleteLambdaFunction(client: lambda.LambdaClient, functionName: string): Promise<Result> {
  try {
    await client.send(
      new lambda.DeleteFunctionCommand({
        FunctionName: functionName,
      }),
    );
  } catch (error) {
    if (!(error instanceof lambda.ResourceNotFoundException)) {
      console.log(error);
      return { success: false, reason: (error as { message?: any }).message };
    }
  }
  return { success: true };
}

export async function generateCodeZip(code: string): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("index.mjs", code);
  return await zip.generateAsync({ type: "uint8array" });
}
