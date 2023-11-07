import * as restate from "@restatedev/restate-sdk";
import { functionProvider } from "./provider/function";

restate.createServer().bindKeyedRouter("provider::function", functionProvider).listen(8080);
