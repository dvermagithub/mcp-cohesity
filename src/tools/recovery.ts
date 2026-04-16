/**
 * Recovery task tools — list and inspect Cohesity data recovery operations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

/** Shorthand for building MCP tool return values. */
const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/** Status values the V2 recoveries endpoint accepts for filtering. */
const RECOVERY_STATUSES = [
  "Accepted",
  "Running",
  "Canceled",
  "Canceling",
  "Failed",
  "Missed",
  "Succeeded",
  "SucceededWithWarning",
  "OnHold",
  "Finalizing",
  "Skipped",
  "LegalHold",
] as const;

/** Environment types supported by recovery operations. */
const RECOVERY_ENVIRONMENTS = [
  "kVMware",
  "kPhysical",
  "kNas",
  "kSQL",
  "kOracle",
  "kView",
  "kAWS",
  "kAzure",
  "kGCP",
  "kO365",
  "kKubernetes",
] as const;

export function registerRecoveryTools(server: McpServer, client: CohesityClient): void {
  // ── List Recovery Tasks ────────────────────────────────────────────────
  server.tool(
    "list_recovery_tasks",
    "List Cohesity recovery tasks with status, type, and progress information",
    {
      status: z
        .array(z.enum(RECOVERY_STATUSES))
        .optional()
        .describe("Filter recovery tasks by status"),
      environments: z
        .array(z.enum(RECOVERY_ENVIRONMENTS))
        .optional()
        .describe("Filter by source environment type"),
      start_time_usecs: z
        .number()
        .optional()
        .describe("Only return tasks created after this timestamp (microseconds)"),
      end_time_usecs: z
        .number()
        .optional()
        .describe("Only return tasks created before this timestamp (microseconds)"),
      max_results: z
        .number()
        .optional()
        .default(25)
        .describe("Cap on the number of results returned"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = { maxCount: String(args.max_results) };

        if (args.status) qp.status = args.status.join(",");
        if (args.environments) qp.environments = args.environments.join(",");
        if (args.start_time_usecs !== undefined) qp.startTimeUsecs = String(args.start_time_usecs);
        if (args.end_time_usecs !== undefined) qp.endTimeUsecs = String(args.end_time_usecs);

        const data = await client.getV2("data-protect/recoveries", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching recovery tasks: ${err}`, true);
      }
    },
  );

  // ── Get Recovery Task ──────────────────────────────────────────────────
  server.tool(
    "get_recovery_task",
    "Get detailed information about a specific Cohesity recovery task including per-object restore status",
    {
      id: z.string().describe("Recovery task ID to retrieve"),
      include_tenants: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include tenant information in the response"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {
          includeTenants: String(args.include_tenants),
        };

        const data = await client.getV2(`data-protect/recoveries/${args.id}`, qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching recovery task ${args.id}: ${err}`, true);
      }
    },
  );
}
