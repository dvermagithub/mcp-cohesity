#!/usr/bin/env node

/**
 * mcp-cohesity — MCP server for Cohesity DataProtect
 * Entry point: validates configuration, wires up tool modules, launches STDIO transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CohesityClient, CohesityConfig } from "./cohesity-client.js";

import { registerClusterTools } from "./tools/cluster.js";
import { registerProtectionTools } from "./tools/protection.js";
import { registerRunsTools } from "./tools/runs.js";
import { registerSourcesTools } from "./tools/sources.js";
import { registerRecoveryTools } from "./tools/recovery.js";
import { registerAlertsTools } from "./tools/alerts.js";
import { registerStorageTools } from "./tools/storage.js";
import { registerRestoreTools } from "./tools/restore.js";
import { registerReportTools } from "./tools/reports.js";
import { registerExternalTargetTools } from "./tools/external-targets.js";
import { registerTieringTools } from "./tools/tiering.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerStatsTools } from "./tools/stats.js";

/** Read and validate required env vars, returning a typed config object. */
function loadConfig(): CohesityConfig {
  const required = ["COHESITY_CLUSTER", "COHESITY_USERNAME", "COHESITY_PASSWORD"] as const;
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    console.error(`Missing required environment variable(s): ${missing.join(", ")}`);
    process.exit(1);
  }

  return {
    cluster: process.env.COHESITY_CLUSTER!,
    username: process.env.COHESITY_USERNAME!,
    password: process.env.COHESITY_PASSWORD!,
    domain: process.env.COHESITY_DOMAIN ?? "LOCAL",
    allowSelfSigned: process.env.COHESITY_ALLOW_SELF_SIGNED !== "false",
  };
}

/** Wire every tool module to the MCP server instance. */
function wireTools(server: McpServer, client: CohesityClient): void {
  const registrations = [
    registerClusterTools,
    registerProtectionTools,
    registerRunsTools,
    registerSourcesTools,
    registerRecoveryTools,
    registerAlertsTools,
    registerStorageTools,
    registerRestoreTools,
    registerReportTools,
    registerExternalTargetTools,
    registerTieringTools,
    registerNotificationTools,
    registerStatsTools,
  ];

  for (const register of registrations) {
    register(server, client);
  }
}

/** Bootstrap the MCP server and begin listening on STDIO. */
async function bootstrap(): Promise<void> {
  const cfg = loadConfig();
  const client = new CohesityClient(cfg);

  const mcp = new McpServer({ name: "cohesity", version: "2.0.0" });
  wireTools(mcp, client);

  const transport = new StdioServerTransport();
  await mcp.connect(transport);

  console.error("Cohesity MCP server running");
}

bootstrap().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
