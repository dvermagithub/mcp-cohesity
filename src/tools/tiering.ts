import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerTieringTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── List Data Tiering Tasks ──────────────────────────────────────────
  server.tool(
    "list_tiering_tasks",
    "List all data tiering tasks that move cold data from primary storage to external targets (cloud, vault). Shows status, schedule, and source/target configuration.",
    {
      ids: z
        .array(z.string())
        .optional()
        .describe("Filter by specific task IDs"),
      include_downtiered_locations: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include list of locations where data has been down-tiered"),
    },
    async ({ ids, include_downtiered_locations }) => {
      try {
        const params: Record<string, string> = {
          includeDowntieredDataLocation: String(include_downtiered_locations),
        };
        if (ids) params.ids = ids.join(",");

        const result = await client.getV2("data-tiering/tasks", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error listing tiering tasks: ${error}`, true);
      }
    },
  );

  // ── Get Tiering Task ─────────────────────────────────────────────────
  server.tool(
    "get_tiering_task",
    "Get details of a specific data tiering task by ID.",
    {
      id: z.string().describe("Tiering task ID"),
    },
    async ({ id }) => {
      try {
        const result = await client.getV2(`data-tiering/tasks/${id}`);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching tiering task ${id}: ${error}`, true);
      }
    },
  );

  // ── Create Tiering Task ──────────────────────────────────────────────
  server.tool(
    "create_tiering_task",
    "Create a data tiering task to automatically move cold data from a NAS/View source to an external target. Requires a registered external target (use list_external_targets to find IDs).",
    {
      name: z.string().describe("Name for the tiering task"),
      description: z.string().optional().describe("Optional description"),
      source_id: z
        .number()
        .describe("Source protection source ID (NAS or View source from list_sources)"),
      external_target_id: z
        .number()
        .describe("Destination external target ID (from list_external_targets)"),
      days_cold: z
        .number()
        .optional()
        .default(90)
        .describe("Tier data that has not been accessed for this many days"),
      schedule_unit: z
        .enum(["Days", "Weeks"])
        .optional()
        .default("Days")
        .describe("Tiering schedule frequency unit"),
      schedule_frequency: z
        .number()
        .optional()
        .default(1)
        .describe("How often to run the tiering task (e.g. 1 = daily)"),
    },
    async ({ name, description, source_id, external_target_id, days_cold, schedule_unit, schedule_frequency }) => {
      try {
        const body: Record<string, unknown> = {
          name,
          type: "Downtier",
          source: { id: source_id },
          targets: [{ id: external_target_id }],
          filtersConfig: {
            lastAccessTimeFilter: {
              daysCount: days_cold,
            },
          },
          schedule: {
            unit: schedule_unit,
            frequency: schedule_frequency,
          },
        };
        if (description) body.description = description;

        const result = await client.postV2("data-tiering/tasks", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error creating tiering task: ${error}`, true);
      }
    },
  );

  // ── Run Tiering Task ─────────────────────────────────────────────────
  server.tool(
    "run_tiering_task",
    "Trigger an on-demand run of a data tiering task.",
    {
      id: z.string().describe("Tiering task ID to run"),
    },
    async ({ id }) => {
      try {
        await client.postV2(`data-tiering/tasks/${id}/runs`, {});
        return toolResult(`Tiering task ${id} run initiated successfully.`);
      } catch (error) {
        return toolResult(`Error running tiering task ${id}: ${error}`, true);
      }
    },
  );

  // ── Pause / Resume Tiering Task ──────────────────────────────────────
  server.tool(
    "update_tiering_task_state",
    "Pause or resume one or more data tiering tasks.",
    {
      ids: z.array(z.string()).describe("List of tiering task IDs"),
      action: z.enum(["Pause", "Resume"]).describe("Action to perform"),
    },
    async ({ ids, action }) => {
      try {
        const body = { ids, action };
        const result = await client.postV2("data-tiering/tasks/states", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error updating tiering task state: ${error}`, true);
      }
    },
  );

  // ── Delete Tiering Task ──────────────────────────────────────────────
  server.tool(
    "delete_tiering_task",
    "Delete a data tiering task.",
    {
      id: z.string().describe("Tiering task ID to delete"),
    },
    async ({ id }) => {
      try {
        await client.deleteV2(`data-tiering/tasks/${id}`);
        return toolResult(`Tiering task ${id} deleted successfully.`);
      } catch (error) {
        return toolResult(`Error deleting tiering task ${id}: ${error}`, true);
      }
    },
  );
}
