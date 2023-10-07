import * as lambda from "@aws-sdk/client-lambda";
import * as restate from "@restatedev/restate-sdk";
import JSZip from "jszip";
import { CloudFunction, Result } from "./formation-service";

const client = new lambda.LambdaClient({
  region: "af-south-1",
});

async function createFunction(
  _: restate.RpcContext,
  functionName: string,
  fn: CloudFunction & { roleArn: string },
): Promise<Result> {
  console.log({ message: `Creating function ${functionName}`, fn });

  const zip = new JSZip();
  zip.file("index.mjs", fn.code);
  const zipContent = await zip.generateAsync({ type: "uint8array" });

  try {
    await client.send(
      new lambda.CreateFunctionCommand({
        FunctionName: fn.functionName,
        Code: {
          ZipFile: zipContent,
        },
        Handler: "index.handler",
        Role: fn.roleArn,
        Runtime: lambda.Runtime.nodejs14x,
        MemorySize: fn.memoryMegabytes,
        Timeout: fn.timeoutSeconds,
      }),
    );
  } catch (error) {
    console.log(error);
    return { success: false, reason: (error as { message?: any }).message };
  }

  return { success: true };
}

async function deleteFunction(ctx: restate.RpcContext, functionName: string): Promise<Result> {
  console.log(`Deleting function ${functionName}.`);

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

export const router = restate.keyedRouter({
  createFunction,
  // updateFunction,
  deleteFunction,
  // listFunction,
  // describeFunction,
});

export type API = typeof router;
