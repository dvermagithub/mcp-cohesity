import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

export function registerExternalTargetTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── List External Targets ────────────────────────────────────────────
  server.tool(
    "list_external_targets",
    "List all registered external targets (cloud vaults, tape, NAS) used for archival and tiering. Returns target IDs needed for protection policy archival configuration.",
    {
      purpose_types: z
        .array(z.enum(["Archival", "Tiering", "Rpaas", "Logbackup"]))
        .optional()
        .describe("Filter by purpose type"),
      storage_types: z
        .array(z.enum(["Azure", "Google", "AWS", "Oracle", "NAS", "QStarTape", "S3Compatible", "IBM"]))
        .optional()
        .describe("Filter by storage type"),
      name: z
        .string()
        .optional()
        .describe("Filter by target name"),
    },
    async ({ purpose_types, storage_types, name }) => {
      try {
        const params: Record<string, string> = {};
        if (purpose_types) params.purposeTypes = purpose_types.join(",");
        if (storage_types) params.storageTypes = storage_types.join(",");
        if (name) params.names = name;

        const result = await client.getV2("data-protect/external-targets", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error listing external targets: ${error}`, true);
      }
    },
  );

  // ── Get External Target ──────────────────────────────────────────────
  server.tool(
    "get_external_target",
    "Get details of a specific external target by ID.",
    {
      id: z.number().describe("External target ID"),
    },
    async ({ id }) => {
      try {
        const result = await client.getV2(`data-protect/external-targets/${id}`);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error fetching external target ${id}: ${error}`, true);
      }
    },
  );

  // ── Create External Target (AWS S3) ──────────────────────────────────
  server.tool(
    "create_external_target_aws",
    "Register a new AWS S3 external target for archival or tiering. Requires an existing IAM role or access key credentials.",
    {
      name: z.string().describe("Name for the external target"),
      purpose_type: z
        .enum(["Archival", "Tiering"])
        .describe("Purpose: Archival (long-term retention) or Tiering (automated cold data movement)"),
      bucket_name: z.string().describe("S3 bucket name"),
      region: z.string().describe("AWS region (e.g. us-east-1)"),
      storage_class: z
        .enum([
          "AmazonS3Standard",
          "AmazonS3StandardIA",
          "AmazonS3OneZoneIA",
          "AmazonS3IntelligentTiering",
          "AmazonS3Glacier",
          "AmazonS3GlacierDeepArchive",
          "AmazonS3GlacierIR",
        ])
        .optional()
        .default("AmazonS3Standard")
        .describe("S3 storage class"),
      access_key_id: z.string().optional().describe("AWS access key ID (leave blank if using IAM role)"),
      secret_access_key: z.string().optional().describe("AWS secret access key"),
      iam_role_arn: z.string().optional().describe("IAM role ARN (alternative to access key)"),
    },
    async ({ name, purpose_type, bucket_name, region, storage_class, access_key_id, secret_access_key, iam_role_arn }) => {
      try {
        const body: Record<string, unknown> = {
          name,
          purposeType: purpose_type,
          storageType: "AWS",
          awsParams: {
            bucketName: bucket_name,
            region,
            storageClass: storage_class,
            ...(iam_role_arn ? { iamRoleArn: iam_role_arn } : {}),
            ...(access_key_id ? { accessKeyId: access_key_id } : {}),
            ...(secret_access_key ? { secretAccessKey: secret_access_key } : {}),
          },
        };

        const result = await client.postV2("data-protect/external-targets", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error creating AWS external target: ${error}`, true);
      }
    },
  );

  // ── Create External Target (Azure) ───────────────────────────────────
  server.tool(
    "create_external_target_azure",
    "Register a new Azure Blob Storage external target for archival or tiering.",
    {
      name: z.string().describe("Name for the external target"),
      purpose_type: z
        .enum(["Archival", "Tiering"])
        .describe("Purpose: Archival or Tiering"),
      container_name: z.string().describe("Azure Blob container name"),
      storage_account_name: z.string().describe("Azure storage account name"),
      storage_account_key: z.string().describe("Azure storage account access key"),
      storage_class: z
        .enum(["AzureHotBlob", "AzureCoolBlob", "AzureColdBlob", "AzureArchiveBlob"])
        .optional()
        .default("AzureCoolBlob")
        .describe("Azure storage tier"),
    },
    async ({ name, purpose_type, container_name, storage_account_name, storage_account_key, storage_class }) => {
      try {
        const body: Record<string, unknown> = {
          name,
          purposeType: purpose_type,
          storageType: "Azure",
          azureParams: {
            containerName: container_name,
            storageAccountName: storage_account_name,
            storageAccountKey: storage_account_key,
            storageClass: storage_class,
          },
        };

        const result = await client.postV2("data-protect/external-targets", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error creating Azure external target: ${error}`, true);
      }
    },
  );

  // ── Delete External Target ───────────────────────────────────────────
  server.tool(
    "delete_external_target",
    "Delete a registered external target. Use force_delete=true only if the target has no active archival jobs.",
    {
      id: z.number().describe("External target ID to delete"),
      force_delete: z
        .boolean()
        .optional()
        .default(false)
        .describe("Force delete even if the target has associated data"),
    },
    async ({ id, force_delete }) => {
      try {
        await client.deleteV2(`data-protect/external-targets/${id}?forceDelete=${force_delete}`);
        return toolResult(`External target ${id} deleted successfully.`);
      } catch (error) {
        return toolResult(`Error deleting external target ${id}: ${error}`, true);
      }
    },
  );
}
