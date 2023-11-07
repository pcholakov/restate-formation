import { LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand } from "@aws-sdk/client-lambda";
import { expect, describe, test } from "@jest/globals";
import * as restate from "@restatedev/restate-sdk";
import { CreateCloudFunction, UpdateCloudFunction, updateFunction } from "../src/provider/function";
import { mockClient } from "aws-sdk-client-mock";

describe("function update", () => {
  const lambdaMock = mockClient(LambdaClient);

  test("update existing function timeout only updates the necessarily configuration", async () => {
    const mockContext = new TestContext("fn", {
      status: "AVAILABLE",
      state: {
        functionName: "fn",
        code: "{ ... }",
        memoryMegabytes: 128,
        timeoutSeconds: 3,
      } satisfies CreateCloudFunction,
    });

    await updateFunction(mockContext, "fn", {
      functionName: "fn",
      timeoutSeconds: 5,
    } satisfies UpdateCloudFunction);

    expect(lambdaMock.commandCalls(UpdateFunctionCodeCommand).length).toBe(0);
    expect(lambdaMock.commandCalls(UpdateFunctionConfigurationCommand).length).toBe(1);
    expect(lambdaMock.commandCalls(UpdateFunctionConfigurationCommand)[0].args[0].input).toEqual({
      FunctionName: "fn",
      MemorySize: undefined,
      Timeout: 5,
    });
  });

  test("update existing function code and config makes two update calls to Lambda", async () => {
    const mockContext = new TestContext("fn", {
      status: "AVAILABLE",
      state: {
        functionName: "fn",
        code: "{ 🐛 }",
        memoryMegabytes: 128,
        timeoutSeconds: 3,
      } satisfies CreateCloudFunction,
    });

    await updateFunction(mockContext, "fn", {
      functionName: "fn",
      code: "{ 🏗️ }",
      timeoutSeconds: 5,
      memoryMegabytes: 256,
    } satisfies UpdateCloudFunction);

    expect(lambdaMock.commandCalls(UpdateFunctionCodeCommand).length).toBe(1);
    const commandCalls = lambdaMock.commandCalls(UpdateFunctionConfigurationCommand);
    expect(commandCalls.length).toBe(1);
    expect(lambdaMock.commandCalls(UpdateFunctionConfigurationCommand)[0].args[0].input).toEqual({
      FunctionName: "fn",
      MemorySize: 256,
      Timeout: 5,
    });
  });
});

class TestContext implements restate.RpcContext {
  id: Buffer;
  serviceName: string;
  state: Map<string, Object>;

  constructor(serviceName: string, state: Record<string, Object>) {
    this.serviceName = serviceName;
    this.id = Buffer.from("id");
    this.state = new Map(Object.entries(state));
  }

  rpc<M>(opts: restate.ServiceApi<M>): restate.Client<M> {
    throw new Error("Method not implemented.");
  }

  send<M>(opts: restate.ServiceApi<M>): restate.SendClient<M> {
    throw new Error("Method not implemented.");
  }

  sendDelayed<M>(opts: restate.ServiceApi<M>, delay: number): restate.SendClient<M> {
    throw new Error("Method not implemented.");
  }

  get<T>(name: string): Promise<T | null> {
    return Promise.resolve(this.state.get(name) as T);
  }

  set<T>(name: string, value: T): void {
    this.state.set(name, value as Object);
  }

  clear(name: string): void {
    this.state.delete(name);
  }

  sideEffect<T>(fn: () => Promise<T>, _retryPolicy?: restate.RestateUtils.RetrySettings | undefined): Promise<T> {
    return fn();
  }

  awakeable<T>(): { id: string; promise: Promise<T> } {
    throw new Error("Method not implemented.");
  }

  resolveAwakeable<T>(id: string, payload: T): void {
    throw new Error("Method not implemented.");
  }

  rejectAwakeable(id: string, reason: string): void {
    throw new Error("Method not implemented.");
  }

  sleep(_: number): Promise<void> {
    return Promise.resolve();
  }
}
