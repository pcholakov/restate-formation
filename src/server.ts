import * as restate from "@restatedev/restate-sdk";
import { functionProvider } from "./provider/function";
import { formationService } from "./formation-service";

restate
  .createServer()
  // .bindKeyedRouter("provider::role", roleProvider)
  .bindKeyedRouter("provider::function", functionProvider)
  .bindKeyedRouter("formation", formationService)
  .listen(8080);
