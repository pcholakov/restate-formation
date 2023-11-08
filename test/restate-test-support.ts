import * as restate from "@restatedev/restate-sdk";

export class TestContext implements restate.RpcContext {
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