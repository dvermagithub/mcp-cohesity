#!/usr/bin/env node

/**
 * mcp-cohesity — MCP server for Cohesity DataProtect
 * Entry point: validates configuration, wires up tool modules, launches STDIO transport.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CohesityClient, CohesityConfig } from "./cohesity-client.js";

import { registerClusterTools } from "./tools/cluster.js";
import { registerProtectionTools } from "./tools/protection.js";
import { registerRunsTools } from "./tools/runs.js";
import { registerSourcesTools } from "./tools/sources.js";
import { registerSourceRegistrationTools } from "./tools/source-registration.js";
import { registerAuditLogTools } from "./tools/audit-logs.js";
import { registerClusterReportTools } from "./tools/cluster-reports.js";
import { registerRunActionTools } from "./tools/run-actions.js";
import { registerUserTools } from "./tools/users.js";
import { registerRoleTools } from "./tools/roles.js";
import { registerActiveDirectoryTools } from "./tools/active-directory.js";
import { registerAntivirusTools } from "./tools/antivirus.js";
import { registerKmsTools } from "./tools/kms.js";
import { registerCloneTools } from "./tools/clones.js";
import { registerRecoveryTools } from "./tools/recovery.js";
import { registerAlertsTools } from "./tools/alerts.js";
import { registerStorageTools } from "./tools/storage.js";
import { registerRestoreTools } from "./tools/restore.js";
import { registerReportTools } from "./tools/reports.js";
import { registerExternalTargetTools } from "./tools/external-targets.js";
import { registerTieringTools } from "./tools/tiering.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerStatsTools } from "./tools/stats.js";

/**
 * Shape of an external credentials file (JSON). Same field names as the
 * env vars but lowercased + camelCase. All optional individually; the
 * merged set (file + env) must satisfy the required fields below.
 */
interface CohesityConfigFile {
  cluster?: string;
  username?: string;
  password?: string;
  domain?: string;
  allowSelfSigned?: boolean;
}

/**
 * Load credentials from an external JSON file if one is provided or found
 * at a default location. Reading is best-effort — if the file is missing,
 * unreadable, or malformed we just return an empty object and let env
 * vars do the work.
 *
 * Resolution order:
 *   1. $COHESITY_CONFIG_FILE if set (absolute or ~/-expanded path)
 *   2. ~/.cohesity-mcp/config.json (if it exists)
 */
function loadConfigFile(): CohesityConfigFile {
  const home = homedir();
  const expand = (p: string) => (p.startsWith("~") ? resolve(home, p.slice(p.startsWith("~/") ? 2 : 1)) : p);

  const explicit = process.env.COHESITY_CONFIG_FILE;
  const candidates = [
    explicit && expand(explicit),
    resolve(home, ".cohesity-mcp", "config.json"),
  ].filter((p): p is string => !!p);

  for (const path of candidates) {
    try {
      const data = readFileSync(path, "utf8");
      const parsed = JSON.parse(data) as CohesityConfigFile;
      console.error(`Loaded Cohesity credentials from ${path}`);
      return parsed;
    } catch (err: unknown) {
      // ENOENT (file missing) at the default path is silent; explicit
      // file path being missing or malformed is a hard error.
      const e = err as NodeJS.ErrnoException;
      if (path === explicit) {
        console.error(`Error reading COHESITY_CONFIG_FILE=${path}: ${e.message}`);
        process.exit(1);
      }
      if (e.code !== "ENOENT") {
        console.error(`Error reading ${path}: ${e.message}`);
      }
    }
  }
  return {};
}

/**
 * Merge external config file and process env vars, with env vars taking
 * precedence so users can override individual fields without editing the
 * file. Returns the typed config object or exits with a clear message
 * if required fields are still missing.
 */
function loadConfig(): CohesityConfig {
  const file = loadConfigFile();

  const cluster = process.env.COHESITY_CLUSTER ?? file.cluster;
  const username = process.env.COHESITY_USERNAME ?? file.username;
  const password = process.env.COHESITY_PASSWORD ?? file.password;
  const domain = process.env.COHESITY_DOMAIN ?? file.domain ?? "LOCAL";

  // allowSelfSigned defaults to true unless explicitly disabled
  const envAllow = process.env.COHESITY_ALLOW_SELF_SIGNED;
  const allowSelfSigned =
    envAllow !== undefined ? envAllow !== "false" : file.allowSelfSigned !== false;

  const missing: string[] = [];
  if (!cluster) missing.push("cluster (COHESITY_CLUSTER)");
  if (!username) missing.push("username (COHESITY_USERNAME)");
  if (!password) missing.push("password (COHESITY_PASSWORD)");
  if (missing.length > 0) {
    console.error(
      `Missing required Cohesity credentials: ${missing.join(", ")}.\n` +
        `Provide them via env vars, or via a JSON file pointed to by COHESITY_CONFIG_FILE\n` +
        `(or the default ~/.cohesity-mcp/config.json). See README for details.`,
    );
    process.exit(1);
  }

  return { cluster: cluster!, username: username!, password: password!, domain, allowSelfSigned };
}

/** Wire every tool module to the MCP server instance. */
function wireTools(server: McpServer, client: CohesityClient): void {
  const registrations = [
    registerClusterTools,
    registerProtectionTools,
    registerRunsTools,
    registerSourcesTools,
    registerSourceRegistrationTools,
    registerRecoveryTools,
    registerAlertsTools,
    registerStorageTools,
    registerRestoreTools,
    registerReportTools,
    registerExternalTargetTools,
    registerTieringTools,
    registerNotificationTools,
    registerStatsTools,
    registerAuditLogTools,
    registerClusterReportTools,
    registerRunActionTools,
    registerUserTools,
    registerRoleTools,
    registerActiveDirectoryTools,
    registerAntivirusTools,
    registerKmsTools,
    registerCloneTools,
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
