/**
 * Alert management tools — list and resolve Cohesity cluster alerts.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

/** Shorthand for building MCP tool return values. */
const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/** Valid alert state values accepted by the Cohesity V2 API. */
const ALERT_STATES = ["kOpen", "kSuppressed", "kResolved", "kNote"] as const;

/** Valid severity levels for alert filtering. */
const ALERT_SEVERITIES = ["kCritical", "kWarning", "kInfo"] as const;

/** Full set of alert category identifiers supported by the V2 alerts endpoint. */
const ALERT_CATEGORIES = [
  "kDisk",
  "kNode",
  "kCluster",
  "kNodeHealth",
  "kClusterHealth",
  "kBackupRestore",
  "kEncryption",
  "kArchivalRestore",
  "kRemoteReplication",
  "kQuota",
  "kLicense",
  "kHeliosProActiveWellness",
  "kHeliosAnalyticsJobs",
  "kHeliosSignatureJobs",
  "kSecurity",
  "kAppsInfra",
  "kAntivirus",
  "kArchivalCopy",
] as const;

export function registerAlertsTools(server: McpServer, client: CohesityClient): void {
  // ── List Alerts ────────────────────────────────────────────────────────
  server.tool(
    "list_alerts",
    "List Cohesity cluster alerts with severity, description, and resolution status",
    {
      alert_states: z
        .array(z.enum(ALERT_STATES))
        .optional()
        .default(["kOpen"])
        .describe("Filter by alert state (default: open alerts only)"),
      alert_severities: z
        .array(z.enum(ALERT_SEVERITIES))
        .optional()
        .describe("Filter by severity level"),
      alert_categories: z
        .array(z.enum(ALERT_CATEGORIES))
        .optional()
        .describe("Filter by alert category"),
      start_date_usecs: z
        .number()
        .optional()
        .describe("Only return alerts created after this timestamp (microseconds)"),
      end_date_usecs: z
        .number()
        .optional()
        .describe("Only return alerts created before this timestamp (microseconds)"),
      max_results: z
        .number()
        .optional()
        .default(50)
        .describe("Cap on the number of alerts returned"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = { maxAlerts: String(args.max_results) };

        if (args.alert_states) qp.alertStates = args.alert_states.join(",");
        if (args.alert_severities) qp.alertSeverityList = args.alert_severities.join(",");
        if (args.alert_categories) qp.alertCategoryList = args.alert_categories.join(",");
        if (args.start_date_usecs !== undefined) qp.startDateUsecs = String(args.start_date_usecs);
        if (args.end_date_usecs !== undefined) qp.endDateUsecs = String(args.end_date_usecs);

        const data = await client.getV2("alerts", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching alerts: ${err}`, true);
      }
    },
  );

  // ── Resolve Alert ──────────────────────────────────────────────────────
  server.tool(
    "resolve_alert",
    "Mark a Cohesity alert as resolved",
    {
      alert_id: z.string().describe("Alert ID to resolve"),
      resolution_summary: z
        .string()
        .optional()
        .describe("Short summary of how the alert was resolved"),
      resolution_details: z
        .string()
        .optional()
        .describe("Detailed description of the resolution actions taken"),
    },
    async (args) => {
      try {
        const payload = {
          alertIdList: [args.alert_id],
          resolutionDetails: {
            resolutionSummary: args.resolution_summary ?? "Resolved via MCP",
            resolutionDetails: args.resolution_details ?? "",
          },
        };

        const data = await client.postV2("alerts/resolutions", payload);
        return reply(`Alert ${args.alert_id} resolved.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error resolving alert ${args.alert_id}: ${err}`, true);
      }
    },
  );
}
