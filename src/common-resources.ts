import * as restate from "@restatedev/restate-sdk";

async function createRole(ctx: restate.RpcContext, roleName: string) {
  // TODO: create role on the fly. For now we just return a pre-created role
  return "arn:aws:iam::542294494919:role/service-role/fun-role-s2s41rkg";
}

export const router = restate.router({
  createRole,
});

export type API = typeof router;
