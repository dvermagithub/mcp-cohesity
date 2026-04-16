/**
 * Cluster information and statistics tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CohesityClient } from "../cohesity-client.js";

/** Shorthand for building MCP tool return values. */
const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerClusterTools(server: McpServer, client: CohesityClient): void {
  // ── Cluster Info ───────────────────────────────────────────────────────
  server.tool(
    "get_cluster_info",
    "Get Cohesity cluster information including name, ID, software version, and node count",
    {},
    async () => {
      try {
        const info = await client.getV2("clusters");
        return reply(JSON.stringify(info, null, 2));
      } catch (err) {
        return reply(`Error fetching cluster info: ${err}`, true);
      }
    },
  );

  // ── Cluster Stats ──────────────────────────────────────────────────────
  server.tool(
    "get_cluster_stats",
    "Get Cohesity cluster storage statistics including total capacity, used and available bytes, and data protection usage",
    {},
    async () => {
      try {
        const [info, storage] = await Promise.all([
          client.getV2("clusters"),
          client.getV2("stats/cluster-storage"),
        ]);
        return reply(JSON.stringify({ cluster: info, storage }, null, 2));
      } catch (err) {
        return reply(`Error fetching cluster stats: ${err}`, true);
      }
    },
  );
}
