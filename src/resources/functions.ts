import * as lambda from "@aws-sdk/client-lambda";
import JSZip from "jszip";
import { CloudFunction, Result } from "../formation-service";

export async function createLambdaFunction(client: lambda.LambdaClient, fn: CloudFunction & { roleArn: string }) {
  const zip = new JSZip();
  zip.file("index.mjs", fn.code);
  const zipContent = await zip.generateAsync({ type: "uint8array" });

  return await client.send(
    new lambda.CreateFunctionCommand({
      FunctionName: fn.functionName,
      Code: {
        ZipFile: zipContent,
      },
      Handler: "index.handler",
      Role: fn.roleArn,
      Runtime: lambda.Runtime.nodejs18x,
      MemorySize: fn.memoryMegabytes,
      Timeout: fn.timeoutSeconds,
    }),
  );
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
