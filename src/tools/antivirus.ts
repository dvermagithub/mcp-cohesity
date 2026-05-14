/**
 * Antivirus / threat-detection tools — manage antivirus service integrations
 * (e.g., ICAP-based scanners) and review infected/quarantined files.
 *
 * Notes:
 *   - Cohesity's "anomaly detection" (ransomware behavioural analysis) is a
 *     Helios SaaS feature and is NOT exposed on standalone on-prem clusters.
 *     For on-prem threat detection, the cluster integrates with ICAP-compliant
 *     antivirus servers via Antivirus Service Groups. This module exposes
 *     those endpoints.
 *
 *   Endpoints (verified against cluster_v2_api.yaml):
 *     GET    /v2/antivirus-service/groups
 *     POST   /v2/antivirus-service/groups
 *     GET    /v2/antivirus-service/groups/{id}
 *     PUT    /v2/antivirus-service/groups/{id}
 *     DELETE /v2/antivirus-service/groups/{id}
 *     GET    /v2/antivirus-service/icap-uri-connection-status
 *     GET    /v2/antivirus-service/infected-files
 *     POST   /v2/antivirus-service/infected-files/actions  (quarantine/unquarantine/delete)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerAntivirusTools(server: McpServer, client: CohesityClient): void {
  // ── List Antivirus Service Groups ──────────────────────────────────────
  server.tool(
    "list_antivirus_groups",
    "List antivirus service groups configured on the cluster. Each group bundles one or more ICAP-compliant antivirus servers.",
    {},
    async () => {
      try {
        const data = await client.getV2("antivirus-service/groups");
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing antivirus groups: ${err}`, true);
      }
    },
  );

  // ── Create Antivirus Service Group ─────────────────────────────────────
  // Schema: CreateAntivirusServiceGroupParams { name, antivirusServices[], description?, state? }
  // AntivirusService { name, icapUri, scanFileSizeKBytes?, isEnabled? }
  server.tool(
    "create_antivirus_group",
    "Create a new antivirus service group. Bundles one or more ICAP servers so the cluster can route on-access scans to them.",
    {
      name: z.string().describe("Group name (unique on the cluster)"),
      description: z.string().optional().describe("Free-form description"),
      antivirus_services: z
        .array(
          z.object({
            name: z.string().describe("Antivirus service display name"),
            icap_uri: z.string().describe("ICAP URI of the antivirus server (e.g. icap://av.example.com:1344/respmod)"),
            is_enabled: z.boolean().default(true).describe("Whether this service is active"),
            scan_file_size_kbytes: z
              .number()
              .optional()
              .describe("Max file size to scan in KB; larger files are skipped"),
          }),
        )
        .min(1)
        .describe("One or more ICAP antivirus services to include in the group"),
      state: z.enum(["Enable", "Disable"]).default("Enable").describe("Initial state of the group"),
    },
    async (args) => {
      try {
        const body = {
          name: args.name,
          description: args.description,
          state: args.state,
          antivirusServices: args.antivirus_services.map((s) => ({
            name: s.name,
            icapUri: s.icap_uri,
            isEnabled: s.is_enabled,
            ...(s.scan_file_size_kbytes !== undefined && {
              scanFileSizeKBytes: s.scan_file_size_kbytes,
            }),
          })),
        };
        const data = await client.postV2("antivirus-service/groups", body);
        return reply(`Antivirus group '${args.name}' created.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error creating antivirus group: ${err}`, true);
      }
    },
  );

  // ── Get Antivirus Service Group ────────────────────────────────────────
  server.tool(
    "get_antivirus_group",
    "Get a single antivirus service group by ID",
    { id: z.number().describe("Antivirus group ID") },
    async (args) => {
      try {
        const data = await client.getV2(`antivirus-service/groups/${args.id}`);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching antivirus group ${args.id}: ${err}`, true);
      }
    },
  );

  // ── Update Antivirus Service Group ─────────────────────────────────────
  server.tool(
    "update_antivirus_group",
    "Update an antivirus service group's name, services, or state",
    {
      id: z.number().describe("Antivirus group ID to update"),
      name: z.string().describe("Group name"),
      description: z.string().optional().describe("Description"),
      antivirus_services: z
        .array(
          z.object({
            name: z.string(),
            icap_uri: z.string(),
            is_enabled: z.boolean().default(true),
            scan_file_size_kbytes: z.number().optional(),
          }),
        )
        .min(1)
        .describe("Replacement list of antivirus services"),
      state: z.enum(["Enable", "Disable"]).describe("Group state"),
    },
    async (args) => {
      try {
        const body = {
          name: args.name,
          description: args.description,
          state: args.state,
          antivirusServices: args.antivirus_services.map((s) => ({
            name: s.name,
            icapUri: s.icap_uri,
            isEnabled: s.is_enabled,
            ...(s.scan_file_size_kbytes !== undefined && {
              scanFileSizeKBytes: s.scan_file_size_kbytes,
            }),
          })),
        };
        const data = await client.putV2(`antivirus-service/groups/${args.id}`, body);
        return reply(`Antivirus group ${args.id} updated.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error updating antivirus group: ${err}`, true);
      }
    },
  );

  // ── Delete Antivirus Service Group ─────────────────────────────────────
  server.tool(
    "delete_antivirus_group",
    "Delete an antivirus service group",
    { id: z.number().describe("Antivirus group ID to delete") },
    async (args) => {
      try {
        await client.deleteV2(`antivirus-service/groups/${args.id}`);
        return reply(`Antivirus group ${args.id} deleted.`);
      } catch (err) {
        return reply(`Error deleting antivirus group: ${err}`, true);
      }
    },
  );

  // ── ICAP URI Connection Status ─────────────────────────────────────────
  server.tool(
    "check_icap_connection",
    "Probe an ICAP antivirus URI and return its current reachability status",
    {
      icap_uri: z.string().describe("ICAP URI to test (e.g. icap://av.example.com:1344/respmod)"),
    },
    async (args) => {
      try {
        const data = await client.getV2("antivirus-service/icap-uri-connection-status", {
          icapUri: args.icap_uri,
        });
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error checking ICAP connection: ${err}`, true);
      }
    },
  );

  // ── List Infected Files ────────────────────────────────────────────────
  server.tool(
    "list_infected_files",
    "List files that an antivirus service has flagged as infected on cluster Views. Filter by view, time range, or quarantine state.",
    {
      view_names: z.array(z.string()).optional().describe("Restrict to these view names"),
      include_quarantined: z.boolean().optional().describe("Include quarantined files in results"),
      include_unquarantined: z.boolean().optional().describe("Include un-quarantined files"),
      start_time_usecs: z.number().optional().describe("Only files detected after this timestamp (microseconds)"),
      end_time_usecs: z.number().optional().describe("Only files detected before this timestamp (microseconds)"),
      max_count: z.number().optional().default(100).describe("Max records to return"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {};
        if (args.view_names?.length) qp.viewNameVec = args.view_names.join(",");
        if (args.include_quarantined !== undefined) qp.includeQuarantinedFiles = String(args.include_quarantined);
        if (args.include_unquarantined !== undefined) qp.includeUnquarantinedFiles = String(args.include_unquarantined);
        if (args.start_time_usecs !== undefined) qp.startTimeUsecs = String(args.start_time_usecs);
        if (args.end_time_usecs !== undefined) qp.endTimeUsecs = String(args.end_time_usecs);
        if (args.max_count !== undefined) qp.maxCount = String(args.max_count);

        const data = await client.getV2("antivirus-service/infected-files", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing infected files: ${err}`, true);
      }
    },
  );
}
