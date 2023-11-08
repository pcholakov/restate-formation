import { LambdaClient, UpdateFunctionCodeCommand, UpdateFunctionConfigurationCommand } from "@aws-sdk/client-lambda";
import { afterEach, describe, expect, test } from "@jest/globals";
import { CreateFunction, UpdateFunction, updateFunction } from "../../src/provider/function";
import { mockClient } from "aws-sdk-client-mock";
import { TestContext } from "../restate-test-support";

describe("function update", () => {
  const lambdaMock = mockClient(LambdaClient);

  afterEach(() => {
    lambdaMock.reset();
  });

  test("update existing function timeout only updates the necessarily configuration", async () => {
    const mockContext = new TestContext("fn", {
      status: "AVAILABLE",
      state: {
        functionName: "fn",
        code: "{ ... }",
        memoryMegabytes: 128,
        timeoutSeconds: 3,
      } satisfies CreateFunction,
    });

    await updateFunction(mockContext, "fn", {
      functionName: "fn",
      timeoutSeconds: 5,
    } satisfies UpdateFunction);

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
      } satisfies CreateFunction,
    });

    await updateFunction(mockContext, "fn", {
      functionName: "fn",
      code: "{ 🏗️ }",
      timeoutSeconds: 5,
      memoryMegabytes: 256,
    } satisfies UpdateFunction);

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
