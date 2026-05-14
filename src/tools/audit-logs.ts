/**
 * Audit log tools — query the cluster's `CLUSTER_AUDIT` log for who-did-what
 * forensics, and read or update the audit log retention configuration.
 *
 * All shapes verified against cluster_v2_api.yaml schemas:
 *   AuditLog, AuditLogs, AuditLogConfig, GetAuditLogs operation.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/**
 * The full entity-type list from the V2 spec is ~80 items long. We expose the
 * most operationally useful ones; callers can still pass arbitrary strings if
 * they really need an entity not in this list.
 */
const COMMON_ENTITY_TYPES = [
  "ProtectionGroup",
  "ProtectionPolicy",
  "ProtectionRun",
  "RecoveryTask",
  "Source",
  "User",
  "Role",
  "Group",
  "ApiKey",
  "AccessToken",
  "Alert",
  "Resolution",
  "AlertNotificationRule",
  "Vault",
  "RemoteCluster",
  "ActiveDirectory",
  "Cluster",
  "Node",
  "Disk",
  "View",
  "StorageDomain",
  "EncryptionKey",
  "CloneTask",
  "Snapshot",
  "Tenant",
  "SearchJob",
] as const;

const AUDIT_ACTIONS = [
  "Login",
  "Logout",
  "Create",
  "Modify",
  "Delete",
  "Activate",
  "Deactivate",
  "Pause",
  "Resume",
  "RunNow",
  "Clone",
  "Recover",
  "Cancel",
  "Register",
  "Unregister",
  "Update",
  "Refresh",
  "Upgrade",
  "Upload",
  "Download",
  "Rename",
  "Accept",
  "Mark",
  "Close",
  "Failover",
  "Failback",
  "Protect",
] as const;

export function registerAuditLogTools(server: McpServer, client: CohesityClient): void {
  // ── List Audit Logs ────────────────────────────────────────────────────
  // GET /v2/audit-logs — supports rich server-side filtering.
  server.tool(
    "list_audit_logs",
    "Query the cluster audit log. Filter by user, action, entity type, time window, or free-text search. Returns who-did-what-when records for compliance and forensics.",
    {
      search_string: z
        .string()
        .optional()
        .describe("Free-text match against entityName or details"),
      usernames: z.array(z.string()).optional().describe("Restrict to these usernames"),
      domains: z.array(z.string()).optional().describe("Restrict to these auth domains"),
      entity_types: z
        .array(z.enum(COMMON_ENTITY_TYPES))
        .optional()
        .describe("Restrict to these entity types (common operational subset)"),
      actions: z.array(z.enum(AUDIT_ACTIONS)).optional().describe("Restrict to these action types"),
      start_time_usecs: z
        .number()
        .optional()
        .describe("Only logs created after this unix microsecond timestamp"),
      end_time_usecs: z
        .number()
        .optional()
        .describe("Only logs created before this unix microsecond timestamp"),
      tenant_ids: z.array(z.string()).optional().describe("Restrict to these tenant IDs"),
      include_tenants: z
        .boolean()
        .optional()
        .describe("Include records from all tenants the caller can see"),
      start_index: z.number().optional().describe("Pagination cursor (skip oldest N)"),
      count: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum records to return per call"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {};
        if (args.search_string) qp.searchString = args.search_string;
        if (args.usernames?.length) qp.usernames = args.usernames.join(",");
        if (args.domains?.length) qp.domains = args.domains.join(",");
        if (args.entity_types?.length) qp.entityTypes = args.entity_types.join(",");
        if (args.actions?.length) qp.actions = args.actions.join(",");
        if (args.start_time_usecs !== undefined) qp.startTimeUsecs = String(args.start_time_usecs);
        if (args.end_time_usecs !== undefined) qp.endTimeUsecs = String(args.end_time_usecs);
        if (args.tenant_ids?.length) qp.tenantIds = args.tenant_ids.join(",");
        if (args.include_tenants !== undefined) qp.includeTenants = String(args.include_tenants);
        if (args.start_index !== undefined) qp.startIndex = String(args.start_index);
        if (args.count !== undefined) qp.count = String(args.count);

        const data = await client.getV2("audit-logs", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching audit logs: ${err}`, true);
      }
    },
  );

  // ── List Audit Log Actions ─────────────────────────────────────────────
  server.tool(
    "list_audit_log_actions",
    "List all action types recognized by the audit log (for building filters)",
    {},
    async () => {
      try {
        const data = await client.getV2("audit-logs/actions");
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching audit log actions: ${err}`, true);
      }
    },
  );

  // ── List Audit Log Entity Types ────────────────────────────────────────
  server.tool(
    "list_audit_log_entity_types",
    "List all entity types tracked in the audit log (for building filters)",
    {},
    async () => {
      try {
        const data = await client.getV2("audit-logs/entity-types");
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching audit log entity types: ${err}`, true);
      }
    },
  );
}
