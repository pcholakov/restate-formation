# Simple composite cloud resource provisioning workflow with Restate

This example implements provisioning an opinionated Function template on AWS Lambda. It supports CRUDL operations over such functions backed by the AWS control plane. Typically, one would use AWS CloudFormation to handle creation, incremental updates and ultimately, deletion, over the lifecycle of a simple stack that might consist of a function, its code bundle, the execution role under which the code runs, and its associated log group. This is a study of a reasonably complicated real-world process and how easy it is to implement from scratch in Restate.

## What it does

Exposes the following RPC operations:

- create function
- update function (TODO)
- delete function
- describe a function by name

A function has the following model:

```ts
interface Function {
  functionName: string;
  code: string;
  memoryMegabytes?: number;
  timeoutSeconds?: number;
  logRetentionDays?: number;
}
```

## Running this example

### Prerequisites

Make sure that the current shell has valid AWS credentials, either configured as a credential provider for the current user or via environment variables. The AWS role under which the Formation service executes must have the following permissions at a minimum:

- `iam:CreateRole`
- `iam:AttachRolePolicy`
- `lambda:CreateFunction`
- `lambda:GetFunction*`
- `lambda:UpdateFunction*`
- `lambda:DeleteFunction`

Alternatively, attach the `AWSLambdaFullAccess` managed policy. Functions are created with a very basic execution role that only permits them logging to their own CloudWatch Log group.

```shell
aws sts get-caller-identity
```

Build and start the service:

```shell
npm install
npm run build
npm run service
```

### Launch the runtime

- For MacOS:

```shell
docker run --name restate_dev --rm -p 8081:8081 -p 9091:9091 -p 9090:9090 -p 5432:5432 ghcr.io/restatedev/restate-dist:latest
```

- For Linux:

```shell
docker run --name restate_dev --rm --network=host ghcr.io/restatedev/restate-dist:latest
```

### Discover services

Once the runtime is up, let it discover the services of the examples by executing:

- For MacOS:

```shell
curl -X POST http://localhost:8081/endpoints -H 'content-type: application/json' -d '{"uri": "http://host.docker.internal:8080"}'
```

- For Linux:

```shell
curl -X POST http://localhost:8081/endpoints -H 'content-type: application/json' -d '{"uri": "http://localhost:8080"}'
```

This should give you the following output in case of the ticket reservation example:

```json
{
  "endpoints": [
    {
      "id": "aG9zdC5kb2NrZXIuaW50ZXJuYWw6ODA4MC8=",
      "uri": "http://host.docker.internal:8080/",
      "protocol_type": "BidiStream",
      "services": [
        {
          "name": "provisioning",
          "revision": 1
        },
        {
          "name": "functions",
          "revision": 1
        },
        {
          "name": "commons",
          "revision": 1
        }
      ]
    }
  ]
}
```

### Call the provisioning service

Create a function.

```shell
curl -X POST localhost:9090/functions/createFunction -H 'content-type: application/json' -d '{"key": "fn-name", "request": { "code": "export const handler = async (event) => { return { statusCode: 200, body: JSON.stringify(`Hello!`) }; };" } }'
```

For more API interactions, see [sample-requests.http](sample-requests.http).
