/**
 * User management tools — list, create, update, and delete Cohesity users
 * (both LOCAL and AD/IdP-backed). All shapes verified against cluster_v2_api.yaml.
 *
 *   GET    /v2/users                — UsersList
 *   POST   /v2/users                — CreateUsersParameters (array of CreateUserParameters)
 *   POST   /v2/users/delete         — DeleteUsersRequest { sids[] }
 *   GET    /v2/users/{sid}          — User
 *   PUT    /v2/users/{sid}          — UpdateUserParameters
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerUserTools(server: McpServer, client: CohesityClient): void {
  // ── List Users ─────────────────────────────────────────────────────────
  server.tool(
    "list_users",
    "List Cohesity users. Filterable by domain, sid, username (partial or exact), email, or role.",
    {
      domain: z.string().optional().describe("Restrict to this auth domain (e.g., LOCAL or AD FQDN)"),
      sids: z.array(z.string()).optional().describe("Restrict to these SIDs"),
      usernames: z.array(z.string()).optional().describe("Restrict to these usernames"),
      match_partial_names: z
        .boolean()
        .optional()
        .describe("Treat usernames as partial matches instead of exact"),
      email_addresses: z.array(z.string()).optional().describe("Restrict to these email addresses"),
      roles: z.array(z.string()).optional().describe("Restrict to users having these roles"),
      tenant_ids: z.array(z.string()).optional().describe("Restrict to these tenant IDs"),
      include_tenants: z
        .boolean()
        .optional()
        .describe("Include users of nested tenants the caller can see"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {};
        if (args.domain) qp.domain = args.domain;
        if (args.sids?.length) qp.sids = args.sids.join(",");
        if (args.usernames?.length) qp.usernames = args.usernames.join(",");
        if (args.match_partial_names !== undefined) qp.matchPartialNames = String(args.match_partial_names);
        if (args.email_addresses?.length) qp.emailAddresses = args.email_addresses.join(",");
        if (args.roles?.length) qp.roles = args.roles.join(",");
        if (args.tenant_ids?.length) qp.tenantIds = args.tenant_ids.join(",");
        if (args.include_tenants !== undefined) qp.includeTenants = String(args.include_tenants);

        const data = await client.getV2("users", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing users: ${err}`, true);
      }
    },
  );

  // ── Get User by SID ────────────────────────────────────────────────────
  server.tool(
    "get_user",
    "Get a single Cohesity user by SID",
    { sid: z.string().describe("User SID") },
    async (args) => {
      try {
        const data = await client.getV2(`users/${encodeURIComponent(args.sid)}`);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching user ${args.sid}: ${err}`, true);
      }
    },
  );

  // ── Create Local User ──────────────────────────────────────────────────
  // POST /v2/users takes an array; we expose a single-user shape for clarity.
  server.tool(
    "create_local_user",
    "Create a new LOCAL Cohesity user with a password. For AD/IdP users, use create_ad_user.",
    {
      username: z.string().describe("Login username"),
      password: z.string().describe("Initial password for the LOCAL user"),
      email: z.string().optional().describe("Email address"),
      description: z.string().optional().describe("Free-form description"),
      roles: z
        .array(z.string())
        .optional()
        .describe("Cohesity role names to assign (e.g. COHESITY_VIEWER, COHESITY_ADMIN)"),
      restricted: z
        .boolean()
        .optional()
        .describe("Restricted users can only view/manage objects they have permissions on"),
      locked: z.boolean().optional().describe("Create the user in a locked state"),
      effective_time_msecs: z
        .number()
        .optional()
        .describe("Epoch ms from which the user can log in"),
      expiry_time_msecs: z.number().optional().describe("Epoch ms when the user expires"),
    },
    async (args) => {
      try {
        const user: Record<string, unknown> = {
          username: args.username,
          domain: "LOCAL",
          localUserParams: {
            password: args.password,
            ...(args.email && { email: args.email }),
          },
        };
        if (args.description) user.description = args.description;
        if (args.roles?.length) user.roles = args.roles;
        if (args.restricted !== undefined) user.restricted = args.restricted;
        if (args.locked !== undefined) user.locked = args.locked;
        if (args.effective_time_msecs !== undefined) user.effectiveTimeMsecs = args.effective_time_msecs;
        if (args.expiry_time_msecs !== undefined) user.expiryTimeMsecs = args.expiry_time_msecs;

        const result = await client.postV2("users", [user]);
        return reply(`User created.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error creating user: ${err}`, true);
      }
    },
  );

  // ── Create AD/IdP User ─────────────────────────────────────────────────
  server.tool(
    "create_ad_user",
    "Create a Cohesity user mapped to an existing Active Directory or IdP principal. No password is set on Cohesity — auth flows through the identity provider.",
    {
      username: z.string().describe("Principal username on the AD/IdP domain"),
      domain: z.string().describe("Auth domain FQDN (e.g. corp.example.com)"),
      email: z.string().optional().describe("Email address"),
      description: z.string().optional().describe("Free-form description"),
      roles: z.array(z.string()).optional().describe("Cohesity role names to assign"),
      restricted: z.boolean().optional().describe("Restricted user flag"),
    },
    async (args) => {
      try {
        const user: Record<string, unknown> = {
          username: args.username,
          domain: args.domain,
        };
        if (args.description) user.description = args.description;
        if (args.roles?.length) user.roles = args.roles;
        if (args.restricted !== undefined) user.restricted = args.restricted;

        const result = await client.postV2("users", [user]);
        return reply(`AD/IdP user mapped.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error mapping AD/IdP user: ${err}`, true);
      }
    },
  );

  // ── Update User ────────────────────────────────────────────────────────
  // PUT /v2/users/{sid}
  server.tool(
    "update_user",
    "Update a Cohesity user — roles, description, restricted flag, or LOCAL user password.",
    {
      sid: z.string().describe("User SID to update"),
      username: z.string().optional().describe("New username (rare; usually keep stable)"),
      description: z.string().optional().describe("New description"),
      roles: z.array(z.string()).optional().describe("Replace role list"),
      restricted: z.boolean().optional().describe("Toggle restricted flag"),
      locked: z.boolean().optional().describe("Lock/unlock the user"),
      new_password: z.string().optional().describe("New password (LOCAL users only)"),
      current_password: z
        .string()
        .optional()
        .describe("Required if a session user is changing their own password"),
      email: z.string().optional().describe("Update email address (LOCAL users only)"),
    },
    async (args) => {
      try {
        const body: Record<string, unknown> = {};
        if (args.username) body.username = args.username;
        if (args.description !== undefined) body.description = args.description;
        if (args.roles) body.roles = args.roles;
        if (args.restricted !== undefined) body.restricted = args.restricted;
        if (args.locked !== undefined) body.locked = args.locked;

        const local: Record<string, unknown> = {};
        if (args.new_password) local.password = args.new_password;
        if (args.current_password) local.currentPassword = args.current_password;
        if (args.email !== undefined) local.email = args.email;
        if (Object.keys(local).length > 0) body.localUserParams = local;

        const result = await client.putV2(`users/${encodeURIComponent(args.sid)}`, body);
        return reply(`User updated.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error updating user: ${err}`, true);
      }
    },
  );

  // ── Delete Users ───────────────────────────────────────────────────────
  // POST /v2/users/delete — note: POST not DELETE, because batch.
  server.tool(
    "delete_users",
    "Delete one or more Cohesity users by SID. AD/IdP principal accounts are NOT deleted — only the Cohesity-side mapping.",
    {
      sids: z.array(z.string()).min(1).describe("SIDs of users to delete"),
    },
    async (args) => {
      try {
        await client.postV2("users/delete", { sids: args.sids });
        return reply(`Deleted ${args.sids.length} user(s).`);
      } catch (err) {
        return reply(`Error deleting users: ${err}`, true);
      }
    },
  );
}
