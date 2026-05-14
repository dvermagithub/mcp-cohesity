/**
 * Protection run actions and snapshot management tools:
 *   - cancel a running protection run (or specific objects within it)
 *   - cancel a recovery task
 *   - set DataLock/WORM on a snapshot (Compliance or Administrative)
 *   - place a snapshot on Legal Hold (or release it)
 *   - extend or shorten snapshot retention
 *   - delete a snapshot immediately
 *
 * Endpoints used (all verified against cluster_v2_api.yaml):
 *   POST /v2/data-protect/protection-groups/{id}/runs/actions
 *   POST /v2/data-protect/recoveries/{id}/cancel
 *   PUT  /v2/data-protect/protection-groups/{id}/runs
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

const RUN_ID_PATTERN = /^\d+:\d+$/;
const TASK_ID_PATTERN = /^\d+:\d+:\d+$/;

export function registerRunActionTools(server: McpServer, client: CohesityClient): void {
  // ── Cancel Protection Run ──────────────────────────────────────────────
  // POST /v2/data-protect/protection-groups/{id}/runs/actions
  // body: PerformActionOnProtectionGroupRunRequest { action: "Cancel", cancelParams: [...] }
  server.tool(
    "cancel_protection_run",
    "Cancel a running protection group run. Can cancel the entire run or a subset of objects/copies (local snapshot, archival, replication). Already-completed object tasks are not cancelled.",
    {
      protection_group_id: z.string().describe("Protection group ID owning the run"),
      run_id: z
        .string()
        .regex(RUN_ID_PATTERN, "Run ID must be in the form <number>:<number>")
        .describe("Run ID to cancel"),
      local_task_id: z
        .string()
        .regex(TASK_ID_PATTERN)
        .optional()
        .describe("Local backup task ID — cancel just the local copy"),
      archival_task_ids: z
        .array(z.string().regex(TASK_ID_PATTERN))
        .optional()
        .describe("Archival task IDs — cancel just these archival copies"),
      replication_task_ids: z
        .array(z.string().regex(TASK_ID_PATTERN))
        .optional()
        .describe("Replication task IDs — cancel just these replication copies"),
      object_ids: z
        .array(z.number())
        .optional()
        .describe("Entity IDs — cancel just these objects within the run"),
    },
    async (args) => {
      try {
        const cancelEntry: Record<string, unknown> = { runId: args.run_id };
        if (args.local_task_id) cancelEntry.localTaskId = args.local_task_id;
        if (args.archival_task_ids?.length) cancelEntry.archivalTaskId = args.archival_task_ids;
        if (args.replication_task_ids?.length) cancelEntry.replicationTaskId = args.replication_task_ids;
        if (args.object_ids?.length) cancelEntry.objectIds = args.object_ids;

        const body = {
          action: "Cancel",
          cancelParams: [cancelEntry],
        };

        const result = await client.postV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs/actions`,
          body,
        );
        return reply(`Cancel request submitted.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error cancelling protection run: ${err}`, true);
      }
    },
  );

  // ── Cancel Recovery Task ───────────────────────────────────────────────
  // POST /v2/data-protect/recoveries/{id}/cancel — 204 No Content on success.
  server.tool(
    "cancel_recovery_task",
    "Cancel an in-flight recovery task by its ID. Returns 204 No Content on success.",
    {
      recovery_id: z
        .string()
        .regex(TASK_ID_PATTERN)
        .describe("Recovery task ID to cancel"),
    },
    async (args) => {
      try {
        await client.postV2(`data-protect/recoveries/${args.recovery_id}/cancel`, {});
        return reply(`Recovery ${args.recovery_id} cancelled.`);
      } catch (err) {
        return reply(`Error cancelling recovery ${args.recovery_id}: ${err}`, true);
      }
    },
  );

  // ── Set DataLock (WORM) on a Snapshot ──────────────────────────────────
  // PUT /v2/data-protect/protection-groups/{id}/runs (UpdateProtectionGroupRunRequestBody).
  // Sets localSnapshotConfig.dataLock = "Compliance" | "Administrative".
  server.tool(
    "set_snapshot_datalock",
    "Apply DataLock (WORM) protection to a protection group run's local snapshot. Once locked, the snapshot cannot be deleted until its retention expires. Compliance lock is even more restrictive — it cannot be released by an administrator.",
    {
      protection_group_id: z.string().describe("Protection group ID owning the run"),
      run_id: z
        .string()
        .regex(RUN_ID_PATTERN)
        .describe("Run ID whose snapshot will be locked"),
      data_lock_mode: z
        .enum(["Compliance", "Administrative"])
        .describe("Compliance is permanent; Administrative can be released by an admin"),
    },
    async (args) => {
      try {
        const body = {
          updateProtectionGroupRunParams: [
            {
              runId: args.run_id,
              localSnapshotConfig: { dataLock: args.data_lock_mode },
            },
          ],
        };
        const result = await client.putV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs`,
          body,
        );
        return reply(`DataLock '${args.data_lock_mode}' applied.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error setting DataLock: ${err}`, true);
      }
    },
  );

  // ── Legal Hold ─────────────────────────────────────────────────────────
  // localSnapshotConfig.enableLegalHold = true/false.
  // Requires Data Security Role on the caller.
  server.tool(
    "set_snapshot_legal_hold",
    "Place a snapshot on legal hold (or release it). While on hold, the snapshot cannot be deleted regardless of retention policy. Requires Data Security Role.",
    {
      protection_group_id: z.string().describe("Protection group ID owning the run"),
      run_id: z.string().regex(RUN_ID_PATTERN).describe("Run ID whose snapshot to hold"),
      enable: z.boolean().describe("true to place on hold, false to release"),
    },
    async (args) => {
      try {
        const body = {
          updateProtectionGroupRunParams: [
            {
              runId: args.run_id,
              localSnapshotConfig: { enableLegalHold: args.enable },
            },
          ],
        };
        const result = await client.putV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs`,
          body,
        );
        return reply(
          `Legal hold ${args.enable ? "applied" : "released"}.\n${JSON.stringify(result, null, 2)}`,
        );
      } catch (err) {
        return reply(`Error updating legal hold: ${err}`, true);
      }
    },
  );

  // ── Extend / Shorten Snapshot Retention ────────────────────────────────
  // localSnapshotConfig.daysToKeep — positive extends, negative shortens.
  // If the resulting expiry is before now, the snapshot is deleted immediately.
  server.tool(
    "extend_snapshot_retention",
    "Extend or shorten a snapshot's retention. Positive days_delta extends, negative shortens. If the resulting expiry falls before now, the snapshot is deleted immediately.",
    {
      protection_group_id: z.string().describe("Protection group ID owning the run"),
      run_id: z.string().regex(RUN_ID_PATTERN).describe("Run ID to adjust"),
      days_delta: z
        .number()
        .int()
        .describe("Days to add (positive) or subtract (negative) from current retention"),
    },
    async (args) => {
      try {
        const body = {
          updateProtectionGroupRunParams: [
            {
              runId: args.run_id,
              localSnapshotConfig: { daysToKeep: args.days_delta },
            },
          ],
        };
        const result = await client.putV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs`,
          body,
        );
        return reply(
          `Retention adjusted by ${args.days_delta} days.\n${JSON.stringify(result, null, 2)}`,
        );
      } catch (err) {
        return reply(`Error adjusting retention: ${err}`, true);
      }
    },
  );

  // ── Delete Snapshot Immediately ────────────────────────────────────────
  // localSnapshotConfig.deleteSnapshot = true. All other params ignored.
  // Will be rejected if the snapshot is on legal hold or under DataLock.
  server.tool(
    "delete_snapshot",
    "Delete a protection group run's local snapshot immediately. WARNING: irreversible. Will fail if the snapshot is under DataLock or Legal Hold.",
    {
      protection_group_id: z.string().describe("Protection group ID owning the run"),
      run_id: z.string().regex(RUN_ID_PATTERN).describe("Run ID whose snapshot to delete"),
    },
    async (args) => {
      try {
        const body = {
          updateProtectionGroupRunParams: [
            {
              runId: args.run_id,
              localSnapshotConfig: { deleteSnapshot: true },
            },
          ],
        };
        const result = await client.putV2(
          `data-protect/protection-groups/${args.protection_group_id}/runs`,
          body,
        );
        return reply(`Snapshot delete requested.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error deleting snapshot: ${err}`, true);
      }
    },
  );
}
