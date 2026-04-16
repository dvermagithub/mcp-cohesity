import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerStorageTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── List Storage Domains ─────────────────────────────────────────────
  server.tool(
    "list_storage_domains",
    "List Cohesity storage domains (view boxes) where backups are stored. The storage domain ID is required when creating protection groups.",
    {
      name: z
        .string()
        .optional()
        .describe("Filter storage domains by name (partial match)"),
      max_results: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of results to return"),
    },
    async ({ name, max_results }) => {
      try {
        const params: Record<string, string> = {
          maxCount: String(max_results),
        };
        if (name) params.name = name;

        const result = await client.getV2("storage-domains", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching storage domains: ${error}`, true);
      }
    },
  );

  // ── List Objects ─────────────────────────────────────────────────────
  server.tool(
    "list_objects",
    "List protectable objects under a registered source (e.g., all VMs under a vCenter). Returns objects with direct 'id' fields suitable for use in protection groups. Requires a parentId (source or container ID from list_sources).",
    {
      parent_id: z
        .number()
        .describe("ID of the parent source or container (e.g., vCenter ID, datacenter ID)"),
      environments: z
        .array(z.enum([
          "kVMware", "kHyperV", "kPhysical", "kSQL", "kOracle",
          "kNetapp", "kGenericNas", "kIsilon", "kFlashBlade",
          "kKubernetes", "kAWS", "kAzure", "kGCP",
        ]))
        .optional()
        .describe("Filter by environment type"),
      max_results: z
        .number()
        .optional()
        .default(100)
        .describe("Maximum number of results to return"),
    },
    async ({ parent_id, environments, max_results }) => {
      try {
        await client.refreshAllSources();
        const params: Record<string, string> = {
          parentId: String(parent_id),
          maxCount: String(max_results),
        };
        if (environments) params.environments = environments.join(",");

        const result = await client.getV2("data-protect/objects", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error listing objects for parent ${parent_id}: ${error}`, true);
      }
    },
  );

  // ── List Snapshots ───────────────────────────────────────────────────
  server.tool(
    "list_snapshots",
    "List available backup snapshots for a specific object (VM, database, etc.). Use the object ID from search_objects (objectProtectionInfos[0].objectId) or list_objects. Snapshot IDs are required for recovery operations.",
    {
      object_id: z
        .number()
        .describe("Object ID to list snapshots for"),
      protection_group_ids: z
        .array(z.string())
        .optional()
        .describe("Filter snapshots by protection group IDs"),
      run_types: z
        .array(z.enum(["kRegular", "kFull", "kLog", "kSystem"]))
        .optional()
        .describe("Filter by backup run type"),
      from_time_usecs: z
        .number()
        .optional()
        .describe("Return snapshots taken after this Unix timestamp in microseconds"),
      to_time_usecs: z
        .number()
        .optional()
        .describe("Return snapshots taken before this Unix timestamp in microseconds"),
      max_results: z
        .number()
        .optional()
        .default(25)
        .describe("Maximum number of snapshots to return"),
    },
    async ({ object_id, protection_group_ids, run_types, from_time_usecs, to_time_usecs, max_results }) => {
      try {
        const params: Record<string, string> = {
          maxCount: String(max_results),
        };
        if (protection_group_ids) params.protectionGroupIds = protection_group_ids.join(",");
        if (run_types) params.runTypes = run_types.join(",");
        if (from_time_usecs !== undefined) params.fromTimeUsecs = String(from_time_usecs);
        if (to_time_usecs !== undefined) params.toTimeUsecs = String(to_time_usecs);

        const result = await client.getV2(
          `data-protect/objects/${object_id}/snapshots`,
          params,
        );
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error listing snapshots for object ${object_id}: ${error}`, true);
      }
    },
  );

  // ── Browse Snapshot Files ────────────────────────────────────────────
  server.tool(
    "browse_snapshot_files",
    "Browse files and folders in a VM snapshot using Cohesity's indexed file search. Returns immediate children of the specified path. Requires indexing to be enabled on the protection group. Use object_id from search_objects (objectProtectionInfos[0].objectId). If indexing is not enabled, enable it via update_protection_group first.",
    {
      object_id: z
        .number()
        .describe("Object (VM) ID to browse — use objectProtectionInfos[0].objectId from search_objects"),
      path: z
        .string()
        .optional()
        .default("/")
        .describe("Directory path to browse (e.g. '/home/zerto', '/etc'). Defaults to root."),
      search_string: z
        .string()
        .optional()
        .describe("Filename pattern to search (e.g. '*.log', 'config*'). Defaults to the last segment of the path, which finds files in that directory."),
      max_results: z
        .number()
        .optional()
        .default(200)
        .describe("Maximum number of indexed entries to fetch"),
    },
    async ({ object_id, path, search_string, max_results }) => {
      try {
        // Normalize path: strip trailing slash, ensure leading slash
        const normPath = ("/" + path.replace(/^\/+|\/+$/g, "")).replace(/\/+/g, "/");

        // Derive a useful search string from the path when not provided.
        // Using "*" alone alphabetically exhausts count before reaching deeper paths like /home.
        // Using the last path segment (e.g. "zerto" for /home/zerto) finds files in that directory.
        const segments = normPath.split("/").filter(Boolean);
        const effectiveSearch = search_string ?? (segments.length > 0 ? segments[segments.length - 1] : "*");

        const body: Record<string, unknown> = {
          objectType: "Files",
          fileParams: {
            searchString: effectiveSearch,
            sourceEnvironments: ["kVMware"],
          },
          objectIds: [object_id],
          count: max_results,
        };

        const result = await client.postV2("data-protect/search/indexed-objects", body) as {
          files?: Array<{ name: string; path: string; type: string }>;
        };
        const files = result.files ?? [];

        if (files.length === 0) {
          return toolResult(
            `No indexed files found for object ${object_id}. Indexing may not be enabled on this VM's protection group. ` +
            `Enable it with update_protection_group using vmwareParams.indexingPolicy.enableIndexing=true, then wait for the next backup run.`
          );
        }

        // Each entry has { name, path } where path is the parent directory with lvol_N/ prefix.
        // Full path = path + "/" + name, then strip lvol_N/ prefix.
        const toClean = (p: string) => ("/" + p.replace(/^lvol_\d+\/?/, "")).replace(/\/+/g, "/");

        // Build full clean paths for all entries
        const allEntries = files.map(f => {
          const rawFull = f.path + "/" + f.name;
          const cleanFull = toClean(rawFull);
          const cleanParent = toClean(f.path);
          return { name: f.name, cleanFull, cleanParent, type: f.type };
        });

        // Filter to entries whose parent equals the requested path (direct children)
        const isRoot = normPath === "/";
        const children = allEntries.filter(e => {
          if (isRoot) {
            // Direct children of root: parent is "/" or ""
            return e.cleanParent === "/" || e.cleanParent === "";
          }
          return e.cleanParent === normPath;
        });

        if (children.length === 0) {
          // No direct children found — show all unique top-level paths as hint
          const uniquePaths = [...new Set(allEntries.map(e => e.cleanParent))].sort().slice(0, 20);
          return toolResult(
            `No entries found directly under '${normPath}'. ` +
            `Indexed paths available: ${uniquePaths.join(", ")}. ` +
            `Try browsing one of these paths, or use a broader search_string.`
          );
        }

        const entries = children.map(e => ({
          name: e.name,
          path: e.cleanFull,
          type: e.type.toLowerCase().replace("k", ""),
        }));

        return toolResult(JSON.stringify({ browsed_path: normPath, object_id, count: entries.length, entries }, null, 2));
      } catch (error) {
        return toolResult(`Error browsing snapshot files for object ${object_id}: ${error}`, true);
      }
    },
  );
}
