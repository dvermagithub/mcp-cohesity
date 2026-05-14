import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerStatsTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── Cluster Storage Stats ────────────────────────────────────────────
  server.tool(
    "get_cluster_storage_stats",
    "Get current cluster storage statistics including total capacity, used space, data reduction ratios, and storage breakdown by category. Useful for capacity planning.",
    {},
    async () => {
      try {
        const result = await client.getV2("stats/cluster-storage");
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching cluster storage stats: ${error}`, true);
      }
    },
  );

  // ── Workload Stats ───────────────────────────────────────────────────
  server.tool(
    "get_workload_stats",
    "Get high-level workload statistics showing data volumes and counts per workload type (VMware, Physical, NAS, SQL, etc.) on the cluster.",
    {},
    async () => {
      try {
        const result = await client.getV2("stats/workload-stats");
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching workload stats: ${error}`, true);
      }
    },
  );

  // ── Replication Backlog Stats ────────────────────────────────────────
  server.tool(
    "get_replication_backlog",
    "Get replication backlog statistics showing how much data is pending replication to remote clusters. Useful for monitoring replication health.",
    {
      is_inbound: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns inbound replication stats. Default is outbound."),
      target_cluster_ids: z
        .array(z.number())
        .optional()
        .describe("Filter to specific remote cluster IDs"),
    },
    async ({ is_inbound, target_cluster_ids }) => {
      try {
        const params: Record<string, string> = {
          isInBound: String(is_inbound),
        };
        if (target_cluster_ids) params.targetClusterList = target_cluster_ids.join(",");

        const result = await client.getV2("stats/replication-backlog", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching replication backlog: ${error}`, true);
      }
    },
  );

  // ── Replication Clusters ─────────────────────────────────────────────
  // The cluster requires startTimeMsecs, rollupIntervalSecs, and
  // targetClusterList. Defaults: last 30 days, daily rollup, all clusters.
  server.tool(
    "get_replication_clusters",
    "Get list of remote replication clusters with total data replicated to/from each. Shows replication partner health at a glance.",
    {
      start_time_msecs: z
        .number()
        .optional()
        .describe("Start of stats window in Unix milliseconds (default: 30 days ago)"),
      rollup_interval_secs: z
        .number()
        .optional()
        .default(86400)
        .describe("Granularity in seconds (default: 86400 = daily)"),
      target_cluster_ids: z
        .array(z.number())
        .optional()
        .describe("Restrict to these target cluster IDs (default: all clusters)"),
      is_inbound: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns inbound replication stats. Default is outbound."),
    },
    async ({ start_time_msecs, rollup_interval_secs, target_cluster_ids, is_inbound }) => {
      try {
        const startMs = start_time_msecs ?? Date.now() - 30 * 86400 * 1000;
        const targets =
          target_cluster_ids?.length
            ? target_cluster_ids.join(",")
            : "0"; // 0 = treat as 'all'; cluster accepts and returns all

        const params: Record<string, string> = {
          startTimeMsecs: String(startMs),
          rollupIntervalSecs: String(rollup_interval_secs),
          targetClusterList: targets,
          isInBound: String(is_inbound),
        };

        const result = await client.getV2("stats/replication-clusters", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching replication clusters: ${error}`, true);
      }
    },
  );

  // ── Replication Data Trend ───────────────────────────────────────────
  server.tool(
    "get_replication_data_trend",
    "Get replication data transfer trends over a time range. Returns time-series data showing how much data was replicated at each interval. Useful for capacity planning and SLA reporting.",
    {
      start_time_msecs: z
        .number()
        .describe("Start time in Unix milliseconds"),
      end_time_msecs: z
        .number()
        .optional()
        .describe("End time in Unix milliseconds (defaults to now)"),
      rollup_interval_secs: z
        .number()
        .optional()
        .default(3600)
        .describe("Granularity of data points in seconds (e.g. 3600 = hourly, 86400 = daily)"),
      is_inbound: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns inbound replication trends"),
    },
    async ({ start_time_msecs, end_time_msecs, rollup_interval_secs, is_inbound }) => {
      try {
        const params: Record<string, string> = {
          startTimeMsecs: String(start_time_msecs),
          rollupIntervalSecs: String(rollup_interval_secs),
          isInBound: String(is_inbound),
        };
        if (end_time_msecs) params.endTimeMsecs = String(end_time_msecs);

        const result = await client.getV2("stats/replication-data-trend", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching replication data trend: ${error}`, true);
      }
    },
  );

  // ── Replication Objects ──────────────────────────────────────────────
  server.tool(
    "get_replication_objects",
    "List all objects that have been replicated to remote clusters in the given time range, with per-object replication status and data size.",
    {
      start_time_msecs: z
        .number()
        .optional()
        .describe("Start time in Unix milliseconds"),
      end_time_msecs: z
        .number()
        .optional()
        .describe("End time in Unix milliseconds"),
      is_inbound: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, returns inbound replicated objects"),
      target_cluster_ids: z
        .array(z.number())
        .optional()
        .describe("Filter to specific remote cluster IDs"),
    },
    async ({ start_time_msecs, end_time_msecs, is_inbound, target_cluster_ids }) => {
      try {
        const params: Record<string, string> = {
          isInBound: String(is_inbound),
        };
        if (start_time_msecs) params.startTimeMsecs = String(start_time_msecs);
        if (end_time_msecs) params.endTimeMsecs = String(end_time_msecs);
        if (target_cluster_ids) params.targetClusterList = target_cluster_ids.join(",");

        const result = await client.getV2("stats/replication-objects", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching replication objects: ${error}`, true);
      }
    },
  );
}
