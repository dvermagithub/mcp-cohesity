/**
 * Key Management System (KMS) tools — list, add, update, and delete KMS
 * configurations on the cluster. Cohesity supports an internal KMS plus
 * external types: AwsKms, KmipKms, IbmKms, GcpKms.
 *
 *   Endpoints (verified against cluster_v2_api.yaml):
 *     GET    /v2/kms
 *     POST   /v2/kms             — KmsConfigurationCreateParams
 *     PUT    /v2/kms/{id}        — KmsConfigurationAddUpdateParams
 *     DELETE /v2/kms/{id}
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

export function registerKmsTools(server: McpServer, client: CohesityClient): void {
  // ── List KMS Configurations ────────────────────────────────────────────
  server.tool(
    "list_kms_configurations",
    "List Key Management Systems (KMS) configured on the cluster. The InternalKms is always present; external types include AwsKms, KmipKms, IbmKms, and GcpKms.",
    {
      ids: z.array(z.number()).optional().describe("Restrict to these KMS IDs"),
      include_rpaas_kms: z
        .boolean()
        .optional()
        .describe("Include KMS configured by FortKnox / RPaaS"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {};
        if (args.ids?.length) qp.ids = args.ids.join(",");
        if (args.include_rpaas_kms !== undefined) qp.includeRpaasKms = String(args.include_rpaas_kms);

        const data = await client.getV2("kms", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error listing KMS configurations: ${err}`, true);
      }
    },
  );

  // ── Add AWS KMS ────────────────────────────────────────────────────────
  // KmsConfigurationCreateParams { type: "AwsKms", awsKmsParams: { ... }, name, ownershipContext?, usageType? }
  server.tool(
    "add_aws_kms",
    "Register an AWS KMS as an encryption key source. Used to encrypt storage domains or external targets.",
    {
      name: z.string().describe("Display name for this KMS configuration"),
      access_key_id: z.string().describe("AWS access key ID"),
      secret_access_key: z.string().describe("AWS secret access key"),
      region: z.string().describe("AWS region (e.g., us-east-1)"),
      cmk_arn: z
        .string()
        .describe("ARN of the AWS KMS Customer Master Key (CMK) to use"),
      storage_domain_ids: z
        .array(z.number())
        .optional()
        .describe("Storage domain IDs to assign this KMS to (cannot change after assignment)"),
      external_target_ids: z
        .array(z.number())
        .optional()
        .describe("External target IDs to assign this KMS to (cannot change after assignment)"),
    },
    async (args) => {
      try {
        const body = {
          name: args.name,
          type: "AwsKms",
          awsKmsParams: {
            accessKeyId: args.access_key_id,
            secretAccessKey: args.secret_access_key,
            region: args.region,
            cmkArn: args.cmk_arn,
          },
          ...(args.storage_domain_ids?.length && { storageDomainIds: args.storage_domain_ids }),
          ...(args.external_target_ids?.length && { externalTargetIds: args.external_target_ids }),
        };
        const data = await client.postV2("kms", body);
        return reply(`AWS KMS '${args.name}' added.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error adding AWS KMS: ${err}`, true);
      }
    },
  );

  // ── Add KMIP KMS ───────────────────────────────────────────────────────
  server.tool(
    "add_kmip_kms",
    "Register a KMIP-compliant KMS (e.g., Thales, Fortanix). Provide endpoint, port, CA cert, and client certs.",
    {
      name: z.string().describe("Display name for this KMS configuration"),
      server_ip: z.string().describe("KMIP server hostname or IP"),
      server_port: z.number().describe("KMIP server port (typically 5696)"),
      ca_certificate: z.string().describe("CA certificate (PEM)"),
      client_certificate: z.string().describe("Client certificate (PEM)"),
      client_key: z.string().describe("Client private key (PEM)"),
      kmip_protocol_version: z
        .enum(["v_1_0", "v_1_1", "v_1_2", "v_1_3", "v_1_4"])
        .default("v_1_2")
        .describe("KMIP protocol version to negotiate"),
      storage_domain_ids: z.array(z.number()).optional(),
      external_target_ids: z.array(z.number()).optional(),
    },
    async (args) => {
      try {
        const body = {
          name: args.name,
          type: "KmipKms",
          kmipKmsParams: {
            serverIp: args.server_ip,
            serverPort: args.server_port,
            caCertificate: args.ca_certificate,
            clientCertificate: args.client_certificate,
            clientKey: args.client_key,
            kmipProtocolVersion: args.kmip_protocol_version,
          },
          ...(args.storage_domain_ids?.length && { storageDomainIds: args.storage_domain_ids }),
          ...(args.external_target_ids?.length && { externalTargetIds: args.external_target_ids }),
        };
        const data = await client.postV2("kms", body);
        return reply(`KMIP KMS '${args.name}' added.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error adding KMIP KMS: ${err}`, true);
      }
    },
  );

  // ── Update KMS ─────────────────────────────────────────────────────────
  // KmsConfigurationAddUpdateParams — adds/changes assignments without
  // re-supplying type-specific provider params.
  server.tool(
    "update_kms",
    "Update an existing KMS configuration — assign additional storage domains or external targets, or rename it. Provider credentials cannot be changed via this method; delete and re-add to rotate credentials.",
    {
      id: z.number().describe("KMS configuration ID"),
      name: z.string().describe("Display name"),
      storage_domain_ids: z
        .array(z.number())
        .optional()
        .describe("Replacement list of storage domain IDs"),
      external_target_ids: z
        .array(z.number())
        .optional()
        .describe("Replacement list of external target IDs"),
    },
    async (args) => {
      try {
        const body = {
          name: args.name,
          ...(args.storage_domain_ids && { storageDomainIds: args.storage_domain_ids }),
          ...(args.external_target_ids && { externalTargetIds: args.external_target_ids }),
        };
        const data = await client.putV2(`kms/${args.id}`, body);
        return reply(`KMS ${args.id} updated.\n${JSON.stringify(data, null, 2)}`);
      } catch (err) {
        return reply(`Error updating KMS: ${err}`, true);
      }
    },
  );

  // ── Delete KMS ─────────────────────────────────────────────────────────
  server.tool(
    "delete_kms",
    "Delete a KMS configuration. The internal KMS (id 0) cannot be deleted.",
    { id: z.number().describe("KMS ID to delete") },
    async (args) => {
      try {
        await client.deleteV2(`kms/${args.id}`);
        return reply(`KMS ${args.id} deleted.`);
      } catch (err) {
        return reply(`Error deleting KMS: ${err}`, true);
      }
    },
  );

  // ── Get External Target Encryption Key ─────────────────────────────────
  // GET /v2/data-protect/external-targets/{id}/encryption-key
  server.tool(
    "get_external_target_encryption_key",
    "Get the encryption key associated with an external target (e.g., AWS S3 bucket, Azure container). Used to verify which KMS is providing keys for archived data.",
    { external_target_id: z.number().describe("External target ID") },
    async (args) => {
      try {
        const data = await client.getV2(
          `data-protect/external-targets/${args.external_target_id}/encryption-key`,
        );
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching external target encryption key: ${err}`, true);
      }
    },
  );
}
