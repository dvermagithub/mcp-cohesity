import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerSourcesTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── List Sources ─────────────────────────────────────────────────────
  server.tool(
    "list_sources",
    "List all registered Cohesity protection sources such as vSphere, Physical servers, NAS, SQL, and more",
    {
      environments: z
        .array(
          z.enum([
            "kVMware",
            "kPhysical",
            "kNas",
            "kSQL",
            "kOracle",
            "kView",
            "kPuppeteer",
            "kGenericNas",
            "kAcropolis",
            "kPhysicalFiles",
            "kIsilon",
            "kNetapp",
            "kAgent",
            "kGenericNas",
            "kAD",
            "kAWS",
            "kAzure",
            "kGCP",
            "kKVM",
            "kAWSNative",
            "kO365",
            "kO365Outlook",
            "kHyperFlex",
            "kGCPNative",
            "kAzureNative",
            "kKubernetes",
            "kElastifile",
            "kFlashBlade",
            "kRDSSnapshotManager",
            "kCassandra",
            "kMongoDB",
            "kCouchbase",
            "kHdfs",
            "kHBase",
            "kUDA",
            "kSfdc",
            "kO365Teams",
            "kO365Group",
            "kO365Exchange",
            "kO365OneDrive",
            "kO365Sharepoint",
          ]),
        )
        .optional()
        .describe("Filter by environment type"),
      include_data_store_details: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include datastore details for VMware sources"),
    },
    async ({ environments, include_data_store_details }) => {
      try {
        const params: Record<string, string> = {};
        if (environments) params.environments = environments.join(",");
        if (include_data_store_details) params.includeApplicationsTreeInfo = "true";

        // /v2/data-protect/sources is not exposed on all cluster builds (some
        // return 404). /sources/registrations is reliably present and returns
        // the same logical set with richer per-source metadata.
        const result = await client.getV2(
          "data-protect/sources/registrations",
          params,
        );
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching protection sources: ${error}`, true);
      }
    },
  );

  // ── Search Objects ───────────────────────────────────────────────────
  server.tool(
    "search_objects",
    "Search for Cohesity protectable objects (VMs, physical servers, databases, etc.) by name or environment. The object ID used for protection groups is found in objectProtectionInfos[0].objectId in the response. For a full list of all VMware objects with IDs, use list_sources then get_source.",
    {
      search_string: z
        .string()
        .optional()
        .describe("Search by object name. Supports wildcard '*' suffix (e.g. 'web-*')"),
      environments: z
        .array(z.enum([
          "kVMware", "kHyperV", "kAWS", "kAzure", "kGCP", "kPhysical",
          "kPhysicalFiles", "kSQL", "kOracle", "kView", "kNetapp", "kGenericNas",
          "kIsilon", "kFlashBlade", "kKubernetes", "kO365", "kO365Exchange",
          "kO365OneDrive", "kO365Sharepoint", "kO365Teams",
        ]))
        .optional()
        .describe("Filter by environment type (e.g. kVMware, kPhysical, kSQL)"),
      source_ids: z
        .array(z.number())
        .optional()
        .describe("Filter by registered source IDs (e.g. vCenter ID)"),
      max_results: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of results to return"),
    },
    async ({ search_string, environments, source_ids, max_results }) => {
      try {
        await client.refreshAllSources();
        const params: Record<string, string> = {
          maxResultsCount: String(max_results),
        };
        if (search_string) params.searchString = search_string;
        if (environments) params.environments = environments.join(",");
        if (source_ids) params.sourceIds = source_ids.join(",");

        const result = await client.getV2("data-protect/search/objects", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error searching objects: ${error}`, true);
      }
    },
  );

  // ── Get Source ───────────────────────────────────────────────────────
  server.tool(
    "get_source",
    "Get detailed information about a specific Cohesity protection source including its object hierarchy",
    {
      id: z
        .number()
        .describe("Source ID to retrieve details for"),
      environment: z
        .string()
        .optional()
        .describe(
          "Environment type of the source (e.g., kVMware, kPhysical, kNas)",
        ),
      include_entity_permission_info: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include entity permission information"),
    },
    async ({ id, environment, include_entity_permission_info }) => {
      try {
        const params: Record<string, string> = {
          includeEntityPermissionInfo: String(include_entity_permission_info),
        };
        if (environment) params.environment = environment;

        const result = await client.getV2(
          `data-protect/sources/registrations/${id}`,
        );
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(
          `Error fetching source ${id}: ${error}`,
          true,
        );
      }
    },
  );

  // ── Refresh Source ───────────────────────────────────────────────────
  server.tool(
    "refresh_source",
    "Refresh a registered protection source to sync the latest inventory from it. For vCenter, this re-discovers VMs, datastores, hosts, and clusters. Use list_sources to get the source ID.",
    {
      id: z
        .number()
        .describe("ID of the protection source to refresh (e.g. vCenter source ID from list_sources)"),
    },
    async ({ id }) => {
      try {
        await client.postV2(`data-protect/sources/${id}/refresh`, {});
        return toolResult(`Source ${id} refresh initiated successfully. The source inventory will be updated shortly.`);
      } catch (error) {
        return toolResult(`Error refreshing source ${id}: ${error}`, true);
      }
    },
  );
}
