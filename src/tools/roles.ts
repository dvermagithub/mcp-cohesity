/**
 * Role management tools — list, create, update, and delete Cohesity roles.
 *
 *   GET    /v2/roles               — Roles
 *   POST   /v2/roles               — CreateRoleParameters { name, privileges[], description? }
 *   PUT    /v2/roles/{name}        — UpdateRoleParameters { privileges[], description? }
 *   DELETE /v2/roles/{name}        — 204 No Content
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerRoleTools(server: McpServer, client: CohesityClient): void {
  // ── List Roles ─────────────────────────────────────────────────────────
  server.tool(
    "list_roles",
    "List Cohesity roles (both built-in and user-created). Each role bundles a set of privileges.",
    {
      names: z.array(z.string()).optional().describe("Restrict to roles with these names"),
      tenant_ids: z.array(z.string()).optional().describe("Restrict to these tenant IDs"),
      include_tenants: z
        .boolean()
        .optional()
        .describe("Include roles from nested tenants the caller can see"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {};
        if (args.names?.length) qp.names = args.names.join(",");
        if (args.tenant_ids?.length) qp.tenantIds = args.tenant_ids.join(",");
        if (args.include_tenants !== undefined) qp.includeTenants = String(args.include_tenants);

        const data = await client.getV2("roles", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing roles: ${err}`, true);
      }
    },
  );

  // ── Create Role ────────────────────────────────────────────────────────
  // CreateRoleParameters = { name (required) } + UpdateRoleParameters
  // UpdateRoleParameters requires `privileges` (min 1 item).
  server.tool(
    "create_role",
    "Create a custom Cohesity role with a specific set of privileges. Privilege names are the same strings shown in the cluster's Role configuration UI (e.g., PROTECTION_VIEW, PROTECTION_MODIFY, CLUSTER_VIEW).",
    {
      name: z.string().describe("Role name (must be unique on the cluster)"),
      privileges: z
        .array(z.string())
        .min(1)
        .describe("List of privilege strings to grant"),
      description: z.string().optional().describe("Free-form description"),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {
          name: args.name,
          privileges: args.privileges,
        };
        if (args.description) body.description = args.description;

        const result = await client.postV2("roles", body);
        return reply(`Role '${args.name}' created.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error creating role: ${err}`, true);
      }
    },
  );

  // ── Update Role ────────────────────────────────────────────────────────
  // PUT /v2/roles/{name} — privileges array must always be supplied.
  server.tool(
    "update_role",
    "Update a Cohesity role's privileges and/or description. The full privilege list must be supplied (this is a replace, not a merge).",
    {
      name: z.string().describe("Role name to update"),
      privileges: z
        .array(z.string())
        .min(1)
        .describe("Full replacement list of privileges"),
      description: z.string().optional().describe("New description"),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = { privileges: args.privileges };
        if (args.description !== undefined) body.description = args.description;

        const result = await client.putV2(`roles/${encodeURIComponent(args.name)}`, body);
        return reply(`Role '${args.name}' updated.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error updating role: ${err}`, true);
      }
    },
  );

  // ── Delete Role ────────────────────────────────────────────────────────
  server.tool(
    "delete_role",
    "Delete a Cohesity role by name. Built-in roles cannot be deleted.",
    { name: z.string().describe("Role name to delete") },
    async (args) => {
      try {
        await client.deleteV2(`roles/${encodeURIComponent(args.name)}`);
        return reply(`Role '${args.name}' deleted.`);
      } catch (err) {
        return reply(`Error deleting role: ${err}`, true);
      }
    },
  );
}
