import * as iam from "@aws-sdk/client-iam";

export type RoleARN = string;

export async function createRole(client: iam.IAMClient, roleName: string, functionName: string): Promise<RoleARN> {
  try {
    // The IAM SDK will throw if the role does not exist; coerce the return types into non-nullable on success.
    return (await client.send(new iam.GetRoleCommand({ RoleName: roleName }))).Role!.Arn!;
  } catch (err) {
    if (!(err instanceof iam.NoSuchEntityException)) {
      throw err;
    }
  }

  const newRole = await client.send(
    new iam.CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { Service: "lambda.amazonaws.com" },
            Action: "sts:AssumeRole",
          },
        ],
      }),
    }),
  );
  if (!newRole.Role) {
    throw new Error("Failed to create role!");
  }

  const putRolePolicyResponse = await client.send(
    new iam.PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: "LogToCloudWatch",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["logs:PutLogEvents"],
            Resource: `arn:aws:logs:log-group:/aws/lambda/${functionName}:*`,
          },
        ],
      }),
    }),
  );
  if (putRolePolicyResponse.$metadata.httpStatusCode !== 200) {
    throw new Error("Failed to attach policy to role!");
  }

  return newRole.Role.Arn!;
}
