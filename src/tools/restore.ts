import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerRestoreTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── Recover VM ───────────────────────────────────────────────────────
  server.tool(
    "recover_vm",
    "Recover a VMware VM from a Cohesity snapshot. By default restores to the original location (overwrite). Use list_snapshots to find the snapshot ID. For in-place recovery, only snapshot_id and name are required.",
    {
      name: z
        .string()
        .describe("Name for this recovery task"),
      snapshot_id: z
        .string()
        .describe("Snapshot ID to recover from (obtained from list_snapshots)"),
      recover_to_new_source: z
        .boolean()
        .optional()
        .default(false)
        .describe("If true, recover to a different vCenter/datastore instead of original location"),
      power_on_vms: z
        .boolean()
        .optional()
        .default(true)
        .describe("Power on the VM after recovery"),
      restore_network: z
        .boolean()
        .optional()
        .default(true)
        .describe("Restore network settings on the recovered VM"),
      prefix: z
        .string()
        .optional()
        .describe("Prefix to add to the recovered VM name (useful to avoid conflicts)"),
      suffix: z
        .string()
        .optional()
        .describe("Suffix to add to the recovered VM name"),
    },
    async ({ name, snapshot_id, recover_to_new_source, power_on_vms, restore_network, prefix, suffix }) => {
      try {
        const recoveryTargetConfig: Record<string, unknown> = {
          recoverToNewSource: recover_to_new_source,
        };
        if (!recover_to_new_source && (prefix || suffix)) {
          recoveryTargetConfig.originalSourceConfig = {
            ...(prefix ? { prefix } : {}),
            ...(suffix ? { suffix } : {}),
          };
        }

        const body = {
          name,
          snapshotEnvironment: "kVMware",
          vmwareParams: {
            objects: [{ snapshotId: snapshot_id }],
            recoveryAction: "RecoverVMs",
            recoverVmParams: {
              targetEnvironment: "kVMware",
              powerOnVms: power_on_vms,
              restoreNetwork: restore_network,
              vmwareTargetParams: {
                recoveryTargetConfig,
              },
            },
          },
        };

        const result = await client.postV2("data-protect/recoveries", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error recovering VM: ${error}`, true);
      }
    },
  );

  // ── Search Files in Snapshots ───────────────────────────────────────
  server.tool(
    "search_files",
    "Search for files and folders across Cohesity snapshots by name. Returns matching files with their paths, source VM, and snapshot info. NOTE: Cohesity prefixes VMware file paths with a volume label (e.g. 'lvol_2/home/user/file') — pass these paths as-is to recover_files, which will automatically strip the prefix when restoring to the original location.",
    {
      search_string: z
        .string()
        .describe("File or folder name to search for (supports partial matches)"),
      source_environments: z
        .array(z.enum(["kVMware", "kPhysical", "kGenericNas", "kIsilon", "kNetapp", "kFlashBlade"]))
        .optional()
        .default(["kVMware"])
        .describe("Source environment types to search within"),
      object_ids: z
        .array(z.number())
        .optional()
        .describe("Limit search to specific object (VM) IDs"),
      max_results: z
        .number()
        .optional()
        .default(25)
        .describe("Maximum number of results to return"),
    },
    async ({ search_string, source_environments, object_ids, max_results }) => {
      try {
        const body: Record<string, unknown> = {
          objectType: "Files",
          searchString: search_string,
          count: max_results,
          fileParams: {
            sourceEnvironments: source_environments,
          },
        };
        if (object_ids) {
          (body.fileParams as Record<string, unknown>).objectIds = object_ids;
        }

        const result = await client.postV2("data-protect/search/indexed-objects", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error searching files: ${error}`, true);
      }
    },
  );

  // ── Recover Files ────────────────────────────────────────────────────
  server.tool(
    "recover_files",
    "Recover specific files or folders from a VMware VM snapshot back to the original VM. Use list_snapshots to get a snapshot ID and search_files to find file paths. Pass file paths exactly as returned by search_files (e.g. 'lvol_2/home/user/file') — the volume prefix is automatically stripped when restoring to original path. The recover_method 'UseExistingAgent' requires a Cohesity agent installed on the VM; 'UseHypervisorApis' uses VMware Tools (requires VM credentials).",
    {
      name: z
        .string()
        .describe("Name for this recovery task"),
      snapshot_id: z
        .string()
        .describe("Snapshot ID to recover files from (obtained from list_snapshots)"),
      file_paths: z
        .array(z.string())
        .describe("Absolute paths of files or folders to recover (e.g. ['/etc/hosts', '/var/log'])"),
      recover_to_original_path: z
        .boolean()
        .optional()
        .default(true)
        .describe("If true, restore to original path. If false, alternate_path must be provided."),
      alternate_path: z
        .string()
        .optional()
        .describe("Alternate path to restore files to (used when recover_to_original_path is false)"),
      recover_method: z
        .enum(["UseExistingAgent", "UseHypervisorApis", "AutoDeploy"])
        .optional()
        .default("UseExistingAgent")
        .describe("Method to deliver files to the VM. UseExistingAgent requires Cohesity agent. UseHypervisorApis requires VMware Tools + credentials."),
      overwrite_existing: z
        .boolean()
        .optional()
        .default(true)
        .describe("Overwrite existing files at the destination"),
      preserve_attributes: z
        .boolean()
        .optional()
        .default(true)
        .describe("Preserve original file timestamps and permissions"),
      vm_username: z
        .string()
        .optional()
        .describe("VM guest OS username (required for UseHypervisorApis method)"),
      vm_password: z
        .string()
        .optional()
        .describe("VM guest OS password (required for UseHypervisorApis method)"),
    },
    async ({
      name, snapshot_id, file_paths, recover_to_original_path, alternate_path,
      recover_method, overwrite_existing, preserve_attributes, vm_username, vm_password,
    }) => {
      try {
        // Cohesity indexes VMware files with a volume prefix (e.g. "lvol_2/home/user/file").
        // When restoring to original path, recoverToOriginalPath:true fails for LVM volumes
        // because Cohesity strips the prefix and can't resolve which physical volume to write to.
        // Workaround: keep lvol_N/ prefix in paths, use recoverToOriginalPath:false, and set
        // alternatePath to the real parent directory (e.g. /home/zerto). This bypasses the
        // volume mapping logic while placing the file in its original location.
        let resolvedPaths = file_paths;
        let resolvedOriginalPath = recover_to_original_path;
        let resolvedAlternatePath = alternate_path;

        if (recover_to_original_path) {
          // Derive the common parent directory (stripped of lvol prefix) as the alternate path.
          // For a single file "lvol_2/home/zerto/file.sh" → alternatePath = "/home/zerto"
          // For a directory "lvol_2/home/zerto" → alternatePath = "/home/zerto"
          const parents = file_paths.map((p) => {
            const stripped = p.replace(/^lvol_\d+\//, "/").replace(/\/+/g, "/");
            // If it looks like a file (has extension or no trailing slash), use its parent dir
            const lastSlash = stripped.lastIndexOf("/");
            return lastSlash > 0 ? stripped.substring(0, lastSlash) : "/";
          });
          // Use the shortest common parent so all files land in the right place
          resolvedAlternatePath = parents.reduce((a, b) => (a.length <= b.length ? a : b));
          resolvedOriginalPath = false; // use alternate_path workaround
          // Keep lvol_N/ prefix in paths — Cohesity needs it to locate the volume
          resolvedPaths = file_paths;
        }

        const originalTargetConfig: Record<string, unknown> = {
          recoverMethod: recover_method,
          recoverToOriginalPath: resolvedOriginalPath,
        };
        if (!resolvedOriginalPath && resolvedAlternatePath) {
          originalTargetConfig.alternatePath = resolvedAlternatePath;
        }
        if (vm_username && vm_password) {
          originalTargetConfig.targetVmCredentials = {
            username: vm_username,
            password: vm_password,
          };
        }

        const body = {
          name,
          snapshotEnvironment: "kVMware",
          vmwareParams: {
            objects: [{ snapshotId: snapshot_id }],
            recoveryAction: "RecoverFiles",
            recoverFileAndFolderParams: {
              filesAndFolders: resolvedPaths.map((p) => ({ absolutePath: p })),
              targetEnvironment: "kVMware",
              vmwareTargetParams: {
                recoverToOriginalTarget: true,
                overwriteExisting: overwrite_existing,
                preserveAttributes: preserve_attributes,
                originalTargetConfig,
              },
            },
          },
        };

        const result = await client.postV2("data-protect/recoveries", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error recovering files: ${error}`, true);
      }
    },
  );

  // ── Cancel Protection Run ────────────────────────────────────────────
  server.tool(
    "cancel_protection_run",
    "Cancel one or more in-progress backup runs for a Cohesity protection group. Use list_protection_runs to find run IDs with status 'Running' or 'Accepted'.",
    {
      protection_group_id: z
        .string()
        .describe("Protection group ID"),
      run_ids: z
        .array(z.string())
        .describe("List of run IDs to cancel (from list_protection_runs)"),
      local_task_id: z
        .string()
        .optional()
        .describe("Cancel a specific local backup task within a run"),
    },
    async ({ protection_group_id, run_ids, local_task_id }) => {
      try {
        const cancelRuns = run_ids.map((runId) => {
          const entry: Record<string, unknown> = { runId };
          if (local_task_id) entry.localTaskId = local_task_id;
          return entry;
        });

        const body = { cancelRuns };

        const result = await client.postV2(
          `data-protect/protection-groups/${protection_group_id}/runs/cancel`,
          body,
        );
        return toolResult(
          result
            ? JSON.stringify(result, null, 2)
            : `Cancel request submitted for ${run_ids.length} run(s).`,
        );
      } catch (error) {
        return toolResult(`Error cancelling runs: ${error}`, true);
      }
    },
  );
}
