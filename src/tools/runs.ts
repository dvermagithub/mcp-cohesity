/**
 * Protection run tools — list and inspect backup run history.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

/** Shorthand for building MCP tool return values. */
const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/** Run type identifiers accepted by the V2 protection runs endpoint. */
const RUN_TYPES = ["kRegular", "kFull", "kLog", "kSystem"] as const;

/** Status values accepted by the V2 protection runs endpoint for filtering. */
const RUN_STATUSES = [
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

export function registerRunsTools(server: McpServer, client: CohesityClient): void {
  // ── List Protection Runs ───────────────────────────────────────────────
  server.tool(
    "list_protection_runs",
    "List recent backup runs for a Cohesity protection group with status, duration, and data size",
    {
      protection_group_id: z.string().describe("Protection group ID to list runs for"),
      run_types: z
        .array(z.enum(RUN_TYPES))
        .optional()
        .describe("Filter by run type (incremental, full, log, system)"),
      local_backup_run_status: z
        .array(z.enum(RUN_STATUSES))
        .optional()
        .describe("Filter by run status"),
      start_time_usecs: z
        .number()
        .optional()
        .describe("Only return runs started after this timestamp (microseconds)"),
      end_time_usecs: z
        .number()
        .optional()
        .describe("Only return runs ended before this timestamp (microseconds)"),
      max_results: z
        .number()
        .optional()
        .default(25)
        .describe("Cap on the number of runs returned"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {
          maxCount: String(args.max_results),
          includeObjectDetails: "false",
        };

        if (args.run_types) qp.runTypes = args.run_types.join(",");
        if (args.local_backup_run_status) qp.localBackupRunStatus = args.local_backup_run_status.join(",");
        if (args.start_time_usecs !== undefined) qp.startTimeUsecs = String(args.start_time_usecs);
        if (args.end_time_usecs !== undefined) qp.endTimeUsecs = String(args.end_time_usecs);

        const data = await client.getV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs`,
          qp,
        );
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching runs for group ${args.protection_group_id}: ${err}`, true);
      }
    },
  );

  // ── Get Protection Run ─────────────────────────────────────────────────
  server.tool(
    "get_protection_run",
    "Get detailed information about a specific Cohesity backup run including per-object status and statistics",
    {
      protection_group_id: z.string().describe("Protection group ID the run belongs to"),
      run_id: z.string().describe("Run ID to retrieve details for"),
      include_object_details: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include per-object backup details"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {
          includeObjectDetails: String(args.include_object_details),
        };

        const data = await client.getV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs/${args.run_id}`,
          qp,
        );
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching run ${args.run_id} for group ${args.protection_group_id}: ${err}`, true);
      }
    },
  );
}
