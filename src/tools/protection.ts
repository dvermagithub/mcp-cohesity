import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerProtectionTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── List Protection Policies ─────────────────────────────────────────
  server.tool(
    "list_protection_policies",
    "List all Cohesity data protection policies including schedule, retention, and replication settings",
    {
      name: z
        .string()
        .optional()
        .describe("Filter policies by name (partial match)"),
    },
    async ({ name }) => {
      try {
        const params: Record<string, string> = {};
        if (name) params.policyNames = name;

        const result = await client.getV2("data-protect/policies", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(
          `Error fetching protection policies: ${error}`,
          true,
        );
      }
    },
  );

  // ── Create Protection Policy ─────────────────────────────────────────
  server.tool(
    "create_protection_policy",
    `Create a new Cohesity protection policy. Supports:
- Basic: incremental-only with retention (e.g. daily incremental, keep 30 days)
- GFS (Grandfather-Father-Son): incremental + weekly full + extended retention tiers (weekly/monthly/yearly). GFS requires full_schedule_day_of_week and at least one of gfs_weekly_retention/gfs_monthly_retention/gfs_yearly_retention.
- DataLock: WORM protection that prevents snapshot deletion. When enabled, applies to all retention tiers automatically.
- Retry options and description also supported.`,
    {
      name: z.string().describe("Name for the new protection policy"),
      description: z.string().optional().describe("Optional description"),

      // Incremental schedule
      incremental_schedule_unit: z
        .enum(["Minutes", "Hours", "Days", "Weeks"])
        .describe("How often to run incremental backups (e.g. Days for daily)"),
      incremental_frequency: z
        .number()
        .optional()
        .default(1)
        .describe("Frequency multiplier (e.g. 1 = every 1 day, 4 = every 4 hours)"),

      // Base retention
      retention_duration: z
        .number()
        .describe("How long to keep daily backups (number of retention_unit)"),
      retention_unit: z
        .enum(["Days", "Weeks", "Months", "Years"])
        .describe("Unit for base retention duration"),

      // Full backup schedule (required for GFS)
      full_schedule_day_of_week: z
        .array(z.enum(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]))
        .optional()
        .describe("Days to run weekly full backups. Required when using GFS extended retention."),

      // GFS extended retention tiers
      gfs_weekly_retention: z
        .number()
        .optional()
        .describe("Keep weekly full backups for this many weeks (GFS weekly tier)"),
      gfs_monthly_retention: z
        .number()
        .optional()
        .describe("Keep monthly full backups for this many months (GFS monthly tier)"),
      gfs_yearly_retention: z
        .number()
        .optional()
        .describe("Keep yearly full backups for this many years (GFS yearly tier)"),

      // DataLock
      datalock_mode: z
        .enum(["Administrative", "Compliance"])
        .optional()
        .describe("Enable DataLock (WORM). Administrative allows admin override; Compliance is strict. Applied to all retention tiers."),
      datalock_duration: z
        .number()
        .optional()
        .describe("DataLock duration (uses same value and unit as each retention tier if not specified)"),

      // Retry options
      retries: z
        .number()
        .optional()
        .default(3)
        .describe("Number of retry attempts on backup failure"),
      retry_interval_mins: z
        .number()
        .optional()
        .default(5)
        .describe("Minutes to wait between retry attempts"),
    },
    async ({
      name, description,
      incremental_schedule_unit, incremental_frequency,
      retention_duration, retention_unit,
      full_schedule_day_of_week,
      gfs_weekly_retention, gfs_monthly_retention, gfs_yearly_retention,
      datalock_mode, datalock_duration,
      retries, retry_interval_mins,
    }) => {
      try {
        const hasGFS = !!(gfs_weekly_retention || gfs_monthly_retention || gfs_yearly_retention);

        // Helper to build a dataLockConfig for a given duration+unit
        const buildDataLock = (duration: number, unit: string) =>
          datalock_mode
            ? { dataLockConfig: { mode: datalock_mode, unit, duration: datalock_duration ?? duration } }
            : {};

        // Incremental schedule
        const scheduleKey =
          incremental_schedule_unit === "Minutes" ? "minuteSchedule" :
          incremental_schedule_unit === "Hours" ? "hourSchedule" :
          incremental_schedule_unit === "Days" ? "daySchedule" : "weekSchedule";

        const regular: Record<string, unknown> = {
          incremental: {
            schedule: { unit: incremental_schedule_unit, [scheduleKey]: { frequency: incremental_frequency } },
          },
          retention: {
            unit: retention_unit,
            duration: retention_duration,
            ...buildDataLock(retention_duration, retention_unit),
          },
        };

        // Full backup schedule — required when using GFS
        if (hasGFS || full_schedule_day_of_week) {
          regular.full = {
            schedule: {
              unit: "Weeks",
              weekSchedule: { dayOfWeek: full_schedule_day_of_week ?? ["Sunday"] },
            },
          };
        }

        // GFS extended retention tiers (all use runType: "Full")
        const extendedRetention: unknown[] = [];
        if (gfs_weekly_retention) {
          extendedRetention.push({
            schedule: { unit: "Weeks", frequency: 1 },
            retention: { unit: "Weeks", duration: gfs_weekly_retention, ...buildDataLock(gfs_weekly_retention, "Weeks") },
            runType: "Full",
          });
        }
        if (gfs_monthly_retention) {
          extendedRetention.push({
            schedule: { unit: "Months", frequency: 1 },
            retention: { unit: "Months", duration: gfs_monthly_retention, ...buildDataLock(gfs_monthly_retention, "Months") },
            runType: "Full",
          });
        }
        if (gfs_yearly_retention) {
          extendedRetention.push({
            schedule: { unit: "Years", frequency: 1 },
            retention: { unit: "Years", duration: gfs_yearly_retention, ...buildDataLock(gfs_yearly_retention, "Years") },
            runType: "Full",
          });
        }

        const body: Record<string, unknown> = {
          name,
          backupPolicy: { regular },
          retryOptions: { retries, retryIntervalMins: retry_interval_mins },
        };
        if (description) body.description = description;
        if (extendedRetention.length > 0) body.extendedRetention = extendedRetention;

        const result = await client.postV2("data-protect/policies", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error creating protection policy: ${error}`, true);
      }
    },
  );

  // ── Update Protection Policy ─────────────────────────────────────────
  server.tool(
    "update_protection_policy",
    "Update an existing Cohesity protection policy. Fetches the current policy and applies changes. Use list_protection_policies to get the policy ID.",
    {
      id: z.string().describe("Protection policy ID to update"),
      name: z.string().optional().describe("New name for the policy"),
      description: z.string().optional().describe("New description"),
      incremental_schedule_unit: z
        .enum(["Minutes", "Hours", "Days", "Weeks", "Months"])
        .optional()
        .describe("Change the incremental backup schedule unit"),
      incremental_frequency: z
        .number()
        .optional()
        .describe("Change the incremental backup frequency"),
      retention_duration: z
        .number()
        .optional()
        .describe("Change retention duration"),
      retention_unit: z
        .enum(["Days", "Weeks", "Months", "Years"])
        .optional()
        .describe("Change retention unit"),
    },
    async ({ id, name, description, incremental_schedule_unit, incremental_frequency, retention_duration, retention_unit }) => {
      try {
        const current = await client.getV2(`data-protect/policies/${id}`) as Record<string, unknown>;
        const body: Record<string, unknown> = { ...current };

        if (name) body.name = name;
        if (description !== undefined) body.description = description;

        if (incremental_schedule_unit || incremental_frequency !== undefined || retention_duration !== undefined || retention_unit) {
          const backupPolicy = (body.backupPolicy ?? {}) as Record<string, unknown>;
          const regular = (backupPolicy.regular ?? {}) as Record<string, unknown>;

          if (incremental_schedule_unit || incremental_frequency !== undefined) {
            const unit = incremental_schedule_unit ??
              ((regular.incremental as Record<string, unknown>)?.schedule as Record<string, unknown>)?.unit as string ?? "Days";
            const freq = incremental_frequency ?? 1;
            const scheduleKey =
              unit === "Minutes" ? "minuteSchedule" :
              unit === "Hours" ? "hourSchedule" :
              unit === "Days" ? "daySchedule" :
              unit === "Weeks" ? "weekSchedule" : "monthSchedule";
            regular.incremental = { schedule: { unit, [scheduleKey]: { frequency: freq } } };
          }

          if (retention_duration !== undefined || retention_unit) {
            const currentRetention = (regular.retention ?? {}) as Record<string, unknown>;
            regular.retention = {
              ...currentRetention,
              ...(retention_duration !== undefined ? { duration: retention_duration } : {}),
              ...(retention_unit ? { unit: retention_unit } : {}),
            };
          }

          body.backupPolicy = { ...backupPolicy, regular };
        }

        const result = await client.putV2(`data-protect/policies/${id}`, body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error updating protection policy ${id}: ${error}`, true);
      }
    },
  );

  // ── Delete Protection Policy ─────────────────────────────────────────
  server.tool(
    "delete_protection_policy",
    "Delete a Cohesity protection policy. The policy must not be in use by any protection groups.",
    {
      id: z.string().describe("Protection policy ID to delete"),
    },
    async ({ id }) => {
      try {
        await client.deleteV2(`data-protect/policies/${id}`);
        return toolResult(`Protection policy ${id} deleted successfully.`);
      } catch (error) {
        return toolResult(`Error deleting protection policy ${id}: ${error}`, true);
      }
    },
  );

  // ── List Protection Groups ───────────────────────────────────────────
  server.tool(
    "list_protection_groups",
    "List Cohesity protection groups (backup jobs) with status, schedule, and last run information",
    {
      name: z
        .string()
        .optional()
        .describe("Filter protection groups by name (partial match)"),
      environment: z
        .string()
        .optional()
        .describe(
          "Filter by environment type (e.g., kVMware, kPhysical, kNas, kSQL)",
        ),
      is_active: z
        .boolean()
        .optional()
        .describe("Filter by active/inactive state"),
      is_paused: z
        .boolean()
        .optional()
        .describe("Filter by paused state"),
      max_results: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of results to return"),
    },
    async ({ name, environment, is_active, is_paused, max_results }) => {
      try {
        const params: Record<string, string> = {
          maxCount: String(max_results),
          includeTenants: "true",
          includeLastRunInfo: "true",
        };
        if (name) params.names = name;
        if (environment) params.environments = environment;
        if (is_active !== undefined) params.isActive = String(is_active);
        if (is_paused !== undefined) params.isPaused = String(is_paused);

        const result = await client.getV2("data-protect/protection-groups", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(
          `Error fetching protection groups: ${error}`,
          true,
        );
      }
    },
  );

  // ── Get Protection Group ─────────────────────────────────────────────
  server.tool(
    "get_protection_group",
    "Get detailed information about a specific Cohesity protection group including configuration, schedule, and last run status",
    {
      id: z
        .string()
        .describe("Protection group ID"),
      include_last_run_info: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include information about the last backup run"),
    },
    async ({ id, include_last_run_info }) => {
      try {
        const params: Record<string, string> = {
          includeLastRunInfo: String(include_last_run_info),
        };

        const result = await client.getV2(
          `data-protect/protection-groups/${id}`,
          params,
        );
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(
          `Error fetching protection group ${id}: ${error}`,
          true,
        );
      }
    },
  );

  // ── Create Protection Group ──────────────────────────────────────────
  server.tool(
    "create_protection_group",
    "Create a new Cohesity protection group (backup job). For VMware, provide vm_ids to protect specific VMs. Requires a policy ID and storage domain ID.",
    {
      name: z.string().describe("Name for the new protection group"),
      policy_id: z.string().describe("ID of the protection policy to apply"),
      environment: z
        .enum(["kVMware", "kPhysical", "kPhysicalFiles", "kSQL", "kOracle",
               "kNetapp", "kGenericNas", "kIsilon", "kView", "kO365"])
        .describe("Environment type of the objects to protect"),
      storage_domain_id: z
        .number()
        .describe("Storage domain (view box) ID where backups will be written"),
      vm_ids: z
        .array(z.number())
        .optional()
        .describe("List of VMware VM object IDs to protect (for kVMware environment)"),
      description: z.string().optional().describe("Optional description for the group"),
      priority: z
        .enum(["kLow", "kMedium", "kHigh"])
        .optional()
        .describe("Priority of the protection group"),
    },
    async ({ name, policy_id, environment, storage_domain_id, vm_ids, description, priority }) => {
      try {
        await client.refreshAllSources();
        const body: Record<string, unknown> = {
          name,
          policyId: policy_id,
          environment,
          storageDomainId: storage_domain_id,
        };
        if (description) body.description = description;
        if (priority) body.priority = priority;
        if (environment === "kVMware" && vm_ids) {
          body.vmwareParams = {
            objects: vm_ids.map((id) => ({ id })),
          };
        }

        const result = await client.postV2("data-protect/protection-groups", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error creating protection group: ${error}`, true);
      }
    },
  );

  // ── Update Protection Group (add/remove VMs) ─────────────────────────
  server.tool(
    "update_protection_group",
    "Update a Cohesity VMware protection group to add or remove VMs. Fetches the current group state, applies the changes, and saves. Use search_objects to find VM IDs first.",
    {
      id: z.string().describe("Protection group ID to update"),
      vm_ids_to_add: z
        .array(z.number())
        .optional()
        .describe("VM object IDs to add to the protection group"),
      vm_ids_to_remove: z
        .array(z.number())
        .optional()
        .describe("VM object IDs to remove from the protection group"),
      name: z.string().optional().describe("New name for the protection group"),
      policy_id: z.string().optional().describe("New policy ID to assign"),
      is_paused: z.boolean().optional().describe("Pause or resume the protection group"),
    },
    async ({ id, vm_ids_to_add, vm_ids_to_remove, name, policy_id, is_paused }) => {
      try {
        await client.refreshAllSources();
        // Fetch current group state to preserve all existing fields
        const current = await client.getV2(
          `data-protect/protection-groups/${id}`,
          { includeLastRunInfo: "false" },
        ) as Record<string, unknown>;

        const body: Record<string, unknown> = { ...current };

        if (name) body.name = name;
        if (policy_id) body.policyId = policy_id;
        if (is_paused !== undefined) body.isPaused = is_paused;

        // Modify the VMware objects list
        if (vm_ids_to_add?.length || vm_ids_to_remove?.length) {
          const vmwareParams = (body.vmwareParams ?? {}) as Record<string, unknown>;
          let objects = (vmwareParams.objects ?? []) as Array<{ id: number }>;

          if (vm_ids_to_remove?.length) {
            const removeSet = new Set(vm_ids_to_remove);
            objects = objects.filter((o) => !removeSet.has(o.id));
          }
          if (vm_ids_to_add?.length) {
            const existingIds = new Set(objects.map((o) => o.id));
            for (const vmId of vm_ids_to_add) {
              if (!existingIds.has(vmId)) objects.push({ id: vmId });
            }
          }

          body.vmwareParams = { ...vmwareParams, objects };
        }

        const result = await client.putV2(`data-protect/protection-groups/${id}`, body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error updating protection group ${id}: ${error}`, true);
      }
    },
  );

  // ── Delete Protection Group ──────────────────────────────────────────
  server.tool(
    "delete_protection_group",
    "Delete a Cohesity protection group. Optionally delete all associated snapshots.",
    {
      id: z.string().describe("Protection group ID to delete"),
      delete_snapshots: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, also delete all snapshots associated with this group"),
    },
    async ({ id, delete_snapshots }) => {
      try {
        await client.refreshAllSources();
        await client.deleteV2(`data-protect/protection-groups/${id}?deleteSnapshots=${delete_snapshots}`);
        return toolResult(`Protection group ${id} deleted successfully.`);
      } catch (error) {
        return toolResult(`Error deleting protection group ${id}: ${error}`, true);
      }
    },
  );

  // ── Pause Protection Group ───────────────────────────────────────────
  server.tool(
    "pause_protection_group",
    "Pause a Cohesity protection group so it stops running scheduled backups",
    {
      id: z.string().describe("Protection group ID to pause"),
    },
    async ({ id }) => {
      try {
        await client.refreshAllSources();
        const current = await client.getV2(
          `data-protect/protection-groups/${id}`,
          { includeLastRunInfo: "false" },
        ) as Record<string, unknown>;
        const result = await client.putV2(
          `data-protect/protection-groups/${id}`,
          { ...current, isPaused: true },
        );
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error pausing protection group ${id}: ${error}`, true);
      }
    },
  );

  // ── Resume Protection Group ──────────────────────────────────────────
  server.tool(
    "resume_protection_group",
    "Resume a paused Cohesity protection group so it resumes scheduled backups",
    {
      id: z.string().describe("Protection group ID to resume"),
    },
    async ({ id }) => {
      try {
        await client.refreshAllSources();
        const current = await client.getV2(
          `data-protect/protection-groups/${id}`,
          { includeLastRunInfo: "false" },
        ) as Record<string, unknown>;
        const result = await client.putV2(
          `data-protect/protection-groups/${id}`,
          { ...current, isPaused: false },
        );
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error resuming protection group ${id}: ${error}`, true);
      }
    },
  );

  // ── Run Protection Group ─────────────────────────────────────────────
  server.tool(
    "run_protection_group",
    "Trigger an on-demand backup run for a Cohesity protection group",
    {
      id: z
        .string()
        .describe("Protection group ID to run"),
      run_type: z
        .enum(["kRegular", "kFull", "kLog", "kSystem"])
        .optional()
        .default("kRegular")
        .describe(
          "Type of backup run: kRegular (incremental), kFull, kLog (log backup), kSystem",
        ),
      objects: z
        .array(
          z.object({
            id: z.number().describe("Object ID to back up"),
          }),
        )
        .optional()
        .describe(
          "Specific objects to back up. Omit to back up all objects in the group.",
        ),
    },
    async ({ id, run_type, objects }) => {
      try {
        await client.refreshAllSources();
        const body: Record<string, unknown> = {
          runType: run_type,
        };
        if (objects) {
          body.objects = objects;
        }

        const result = await client.postV2(
          `data-protect/protection-groups/${id}/runs`,
          body,
        );
        return toolResult(
          `Protection group run initiated successfully.\n${JSON.stringify(result, null, 2)}`,
        );
      } catch (error) {
        return toolResult(
          `Error running protection group ${id}: ${error}`,
          true,
        );
      }
    },
  );
}
