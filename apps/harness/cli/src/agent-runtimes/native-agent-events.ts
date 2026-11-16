import type { CodexOptions } from "@openai/codex-sdk";
/** Official Codex HTTP MCP transport; credentials stay in the host environment.
 * No stdio helper, local daemon, copied login or separately billed inference.
 */
export function nativeAgentEventsConfig(environment:Readonly<Record<string,string|undefined>>=process.env): NonNullable<CodexOptions["config"]> {
  const host=environment.HYPERFOCUS_HOST_URL??environment.HYPERFOCUS_SWARM_URL;
  const tokenName=environment.HYPERFOCUS_HOST_URL?"HYPERFOCUS_HOST_TOKEN":"HYPERFOCUS_SWARM_TOKEN";
  if(!host||!environment[tokenName]||environment.HYPERFOCUS_SWARM_ARCHIVE==="1")return {};
  const origin=new URL(host);
  if(origin.protocol!=="https:"||origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/")return {};
  return {mcp_servers:{hyperfocus_events:{url:`${origin.origin}/api/agent-events/v1/mcp`,bearer_token_env_var:tokenName,
    enabled_tools:["agent_events_resume","agent_events_wait","agent_events_acknowledge"],startup_timeout_sec:10,tool_timeout_sec:60}}};
}
