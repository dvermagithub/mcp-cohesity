/**
 * Active Directory management tools — join, list, and remove AD domains from
 * the Cohesity cluster.
 *
 *   GET    /v2/active-directories          — list
 *   POST   /v2/active-directories          — CreateActiveDirectoryRequest
 *   DELETE /v2/active-directories/{id}     — leave domain
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerActiveDirectoryTools(server: McpServer, client: CohesityClient): void {
  // ── List Active Directories ────────────────────────────────────────────
  server.tool(
    "list_active_directories",
    "List Active Directory domains joined to the Cohesity cluster",
    {
      domain_names: z.array(z.string()).optional().describe("Filter by domain names"),
      ids: z.array(z.number()).optional().describe("Filter by AD IDs"),
      tenant_ids: z.array(z.string()).optional().describe("Restrict to these tenant IDs"),
      include_tenants: z.boolean().optional().describe("Include nested-tenant ADs"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {};
        if (args.domain_names?.length) qp.domainNames = args.domain_names.join(",");
        if (args.ids?.length) qp.ids = args.ids.join(",");
        if (args.tenant_ids?.length) qp.tenantIds = args.tenant_ids.join(",");
        if (args.include_tenants !== undefined) qp.includeTenants = String(args.include_tenants);

        const data = await client.getV2("active-directories", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing active directories: ${err}`, true);
      }
    },
  );

  // ── Join Active Directory ──────────────────────────────────────────────
  // CreateActiveDirectoryRequest requires { domainName, activeDirectoryAdminParams }.
  server.tool(
    "join_active_directory",
    "Join the cluster to an Active Directory domain using admin credentials with rights to add a computer to the domain.",
    {
      domain_name: z
        .string()
        .describe("AD domain FQDN (e.g. corp.example.com)"),
      admin_username: z
        .string()
        .describe("Username of an AD admin able to join machines to the domain"),
      admin_password: z.string().describe("Password for the admin account"),
      overwrite_machine_accounts: z
        .boolean()
        .optional()
        .describe("Overwrite existing computer accounts in the domain if needed"),
    },
    async (args) => {
      try {
        const body = {
          domainName: args.domain_name,
          activeDirectoryAdminParams: {
            username: args.admin_username,
            password: args.admin_password,
          },
          ...(args.overwrite_machine_accounts !== undefined && {
            overwriteMachineAccounts: args.overwrite_machine_accounts,
          }),
        };

        const result = await client.postV2("active-directories", body);
        return reply(`Joined AD ${args.domain_name}.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error joining Active Directory: ${err}`, true);
      }
    },
  );

  // ── Leave Active Directory ─────────────────────────────────────────────
  server.tool(
    "leave_active_directory",
    "Remove an Active Directory from the Cohesity cluster",
    { id: z.number().describe("AD ID to remove") },
    async (args) => {
      try {
        await client.deleteV2(`active-directories/${args.id}`);
        return reply(`Active Directory ${args.id} removed.`);
      } catch (err) {
        return reply(`Error removing AD: ${err}`, true);
      }
    },
  );
}
