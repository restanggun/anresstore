import { setDefaultResultOrder } from "node:dns";
import { setDefaultAutoSelectFamily } from "node:net";

/** Opt-in for provider allowlists tied to a fixed IPv4 egress address. */
export function configureOutboundNetwork(env: NodeJS.ProcessEnv = process.env) {
  if (env.API_OUTBOUND_IPV4_ONLY === "true") {
    setDefaultResultOrder("ipv4first");
    setDefaultAutoSelectFamily(false);
  }
}
