/**
 * Clone tools — create and manage instant-clone tasks for test/dev workflows.
 *
 * Two distinct clone types exist on Cohesity:
 *
 *   1. VIEW CLONE — Snapshots an existing file-services View into a new View.
 *      Endpoint: POST /v2/file-services/views/{id}/clone
 *
 *   2. RECOVERY CLONE TASK — Created via the standard /recoveries endpoint with
 *      a clone-specific Recovery payload (recoveryAction = "CloneVMs"); the
 *      task lifecycle is then managed through /recoveries/clone/{id}.
 *
 * This module covers both. Recovery clones (VMs) use the same recover_vm
 * tool but with cloneVmsParams instead of recoverVmsParams; we provide a
 * thin shortcut here so the LLM can find it easily.
 *
 *   Endpoints (verified against cluster_v2_api.yaml):
 *     POST   /v2/file-services/views/{id}/clone   — CloneViewParams
 *     DELETE /v2/data-protect/recoveries/clone/{id}
 *     GET    /v2/data-protect/recoveries          (filter by recoveryAction=CloneVMs)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerCloneTools(server: McpServer, client: CohesityClient): void {
  // ── List Clone Tasks ───────────────────────────────────────────────────
  // Recovery clones live in /data-protect/recoveries with recoveryAction filtering.
  server.tool(
    "list_clone_tasks",
    "List active and historical clone tasks (CloneVMs, CloneView, CloneAppView). Use filters to narrow by status or time range.",
    {
      status: z
        .array(
          z.enum([
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
          ]),
        )
        .optional()
        .describe("Filter by status"),
      start_time_usecs: z.number().optional().describe("Only tasks created after this timestamp (μs)"),
      end_time_usecs: z.number().optional().describe("Only tasks created before this timestamp (μs)"),
      max_results: z.number().default(25).describe("Maximum results"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {
          maxCount: String(args.max_results),
          recoveryActions: "CloneVMs,CloneView,CloneAppView",
        };
        if (args.status?.length) qp.status = args.status.join(",");
        if (args.start_time_usecs !== undefined) qp.startTimeUsecs = String(args.start_time_usecs);
        if (args.end_time_usecs !== undefined) qp.endTimeUsecs = String(args.end_time_usecs);

        const data = await client.getV2("data-protect/recoveries", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing clone tasks: ${err}`, true);
      }
    },
  );

  // ── Clone a View ───────────────────────────────────────────────────────
  // POST /v2/file-services/views/{id}/clone with CloneViewParams.
  server.tool(
    "clone_view",
    "Clone a file-services View into a new View. The clone is space-efficient (snapshot-backed). Useful for spinning up read/write test copies of production data.",
    {
      source_view_id: z.number().describe("ID of the View to clone"),
      name: z.string().describe("Name for the new cloned View"),
      description: z.string().optional().describe("Description for the cloned View"),
      read_only: z.boolean().optional().describe("Create the clone as read-only"),
      data_lock_expiry_usecs: z
        .number()
        .optional()
        .describe("DataLock expiry as unix microseconds (makes the clone WORM-locked)"),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = { name: args.name };
        if (args.description) body.description = args.description;
        if (args.read_only !== undefined) body.isReadOnly = args.read_only;
        if (args.data_lock_expiry_usecs !== undefined) {
          body.dataLockExpiryUsecs = args.data_lock_expiry_usecs;
        }

        const data = await client.postV2(`file-services/views/${args.source_view_id}/clone`, body);
        return reply(`View ${args.source_view_id} cloned as '${args.name}'.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error cloning view: ${err}`, true);
      }
    },
  );

  // ── Delete Recovery Clone Task ─────────────────────────────────────────
  server.tool(
    "delete_clone_task",
    "Delete a restore clone task by ID. This tears down the clone and releases its space.",
    { id: z.number().describe("Clone task ID to delete") },
    async (args) => {
      try {
        await client.deleteV2(`data-protect/recoveries/clone/${args.id}`);
        return reply(`Clone task ${args.id} deleted.`);
      } catch (err) {
        return reply(`Error deleting clone task: ${err}`, true);
      }
    },
  );
}
