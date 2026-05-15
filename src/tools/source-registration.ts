/**
 * Source registration tools — register, update, and unregister protection sources.
 * Covers VMware (vCenter / ESXi / vCloud), Physical, Azure, AWS, M365, and Generic NAS.
 *
 * All payload shapes are derived from the cluster's OpenAPI v2 spec
 * (cluster_v2_api.yaml). Field names match the spec exactly; deviating from
 * the spec produces KValidationError from the cluster.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/**
 * POST a registration body and best-effort kick off an inventory discovery
 * so subsequent search_objects calls find the new source's objects.
 */
async function postRegistration(
  client: CohesityClient,
  body: Record<string, unknown>,
  label: string,
) {
  const result = await client.postV2("data-protect/sources/registrations", body);
  const id = (result as { id?: number }).id;

  if (id) {
    try {
      await client.postV2(`data-protect/sources/${id}/refresh`, {});
    } catch {
      /* discovery refresh is best-effort */
    }
  }

  return reply(`${label} registered.\n${JSON.stringify(result, null, 2)}`);
}

export function registerSourceRegistrationTools(
  server: McpServer,
  client: CohesityClient,
): void {
  // ── VMware vCenter / ESXi standalone / vCloud Director ──────────────────
  // Schema: VmwareSourceRegistrationParams { type, vCenterParams | esxiParams | vcdParams }
  // vCenter and ESXi inherit CommonSourceRegistrationParams which is
  // Credentials { username, password } + { endpoint (required) }.
  server.tool(
    "register_vmware_source",
    "Register a VMware vCenter, ESXi standalone host, or vCloud Director endpoint as a backup source",
    {
      vmware_type: z
        .enum(["kVCenter", "kStandaloneHost", "kvCloudDirector"])
        .default("kVCenter")
        .describe("VMware source type"),
      endpoint: z
        .string()
        .describe("Hostname or IP of the vCenter, ESXi host, or vCloud endpoint (not used for vCloud — provide vcd_vcenters instead)"),
      username: z.string().describe("Username for the source"),
      password: z.string().describe("Password for the source"),
      vcd_vcenters: z
        .array(
          z.object({
            endpoint: z.string(),
            username: z.string(),
            password: z.string(),
            name: z.string().optional(),
          }),
        )
        .optional()
        .describe("vCenters backing the vCloud Director (only when vmware_type=kvCloudDirector)"),
    },
    async (args) => {
      try {
        const cred = {
          endpoint: args.endpoint,
          username: args.username,
          password: args.password,
        };

        const vmwareParams: Record<string, unknown> = { type: args.vmware_type };

        if (args.vmware_type === "kVCenter") {
          vmwareParams.vCenterParams = cred;
        } else if (args.vmware_type === "kStandaloneHost") {
          vmwareParams.esxiParams = cred;
        } else {
          if (!args.vcd_vcenters?.length) {
            return reply(
              "vCloud Director registration requires vcd_vcenters with at least one vCenter credential set.",
              true,
            );
          }
          vmwareParams.vcdParams = {
            vcenterCredentialInfoList: args.vcd_vcenters,
          };
        }

        return await postRegistration(
          client,
          { environment: "kVMware", vmwareParams },
          `VMware ${args.vmware_type} ${args.endpoint}`,
        );
      } catch (err) {
        return reply(`Error registering VMware source: ${err}`, true);
      }
    },
  );

  // ── Physical Server ────────────────────────────────────────────────────
  // Schema: PhysicalSourceRegistrationParams { endpoint (required), hostType?, physicalType?, forceRegister?, applications? }
  server.tool(
    "register_physical_source",
    "Register a physical server (Linux, Windows, AIX, Solaris, SAP HANA) as a backup source. Requires the Cohesity agent to be installed and reachable on the host.",
    {
      endpoint: z.string().describe("Hostname or IP of the physical server"),
      host_type: z
        .enum(["kLinux", "kWindows", "kAix", "kSolaris", "kSapHana", "kOther", "kHPUX", "kVOS"])
        .optional()
        .describe("Operating system of the physical host"),
      physical_type: z
        .enum(["kGroup", "kHost", "kWindowsCluster", "kOracleRACCluster", "kOracleAPCluster", "kUnixCluster", "kOracleCluster"])
        .optional()
        .describe("Physical source topology"),
      force_register: z
        .boolean()
        .optional()
        .describe("Force registration even if the host is already registered with another cluster"),
      applications: z
        .array(z.enum(["kSQL", "kOracle"]))
        .optional()
        .describe("Applications to register with the physical source"),
    },
    async (args) => {
      try {
        const physicalParams: Record<string, unknown> = { endpoint: args.endpoint };
        if (args.host_type) physicalParams.hostType = args.host_type;
        if (args.physical_type) physicalParams.physicalType = args.physical_type;
        if (args.force_register !== undefined) physicalParams.forceRegister = args.force_register;
        if (args.applications?.length) physicalParams.applications = args.applications;

        return await postRegistration(
          client,
          { environment: "kPhysical", physicalParams },
          `Physical host ${args.endpoint}`,
        );
      } catch (err) {
        return reply(`Error registering physical source: ${err}`, true);
      }
    },
  );

  // ── Azure Subscription ─────────────────────────────────────────────────
  // Schema: AzureSourceRegistrationParams {
  //   registrationLevel (REQUIRED, kTenant|kSubscription),
  //   registrationWorkflow (REQUIRED, kExpress|kManual),
  //   azureTenantId?, subscriptionDetails?[{ subscriptionId }],
  //   applicationCredentials?[{ applicationId, applicationObjectId?, encryptedApplicationKey? }],
  //   useCases?
  // }
  server.tool(
    "register_azure_source",
    "Register an Azure tenant or subscription as a backup source for protecting Azure VMs, SQL, Files, Blob, and other workloads",
    {
      registration_level: z
        .enum(["kTenant", "kSubscription"])
        .describe("Whether registering at tenant level or specific subscription level"),
      registration_workflow: z
        .enum(["kExpress", "kManual"])
        .describe("kExpress uses Cohesity-managed app, kManual uses your own Azure AD app"),
      tenant_id: z
        .string()
        .describe("Azure AD tenant ID (GUID or domain name)"),
      subscription_ids: z
        .array(z.string())
        .optional()
        .describe("Azure subscription IDs to register. REQUIRED when registration_level=kSubscription"),
      application_id: z
        .string()
        .describe("Azure AD app registration (client) ID — applicationCredentials is required by the cluster"),
      application_key: z
        .string()
        .describe("Azure AD app registration client secret"),
      use_cases: z
        .array(
          z.enum([
            "kVirtualMachine",
            "kSQL",
            "kEntraID",
            "kFileShare",
            "kKubernetes",
            "kBlobStorage",
            "kAzureSQLMI",
            "kAzureSQLDB",
          ]),
        )
        .optional()
        .describe("Azure workload types to enable for this registration"),
    },
    async (args) => {
      try {
        if (args.registration_level === "kSubscription" && !args.subscription_ids?.length) {
          return reply(
            "registration_level=kSubscription requires at least one subscription_id.",
            true,
          );
        }

        const azureParams: Record<string, unknown> = {
          registrationLevel: args.registration_level,
          registrationWorkflow: args.registration_workflow,
          azureTenantId: args.tenant_id,
          applicationCredentials: [
            {
              applicationId: args.application_id,
              encryptedApplicationKey: args.application_key,
            },
          ],
        };
        if (args.subscription_ids?.length) {
          azureParams.subscriptionDetails = args.subscription_ids.map((id) => ({
            subscriptionId: id,
          }));
        }
        if (args.use_cases?.length) azureParams.useCases = args.use_cases;

        return await postRegistration(
          client,
          { environment: "kAzure", azureParams },
          `Azure ${args.registration_level} ${args.tenant_id ?? ""}`,
        );
      } catch (err) {
        return reply(`Error registering Azure source: ${err}`, true);
      }
    },
  );

  // ── AWS Account ────────────────────────────────────────────────────────
  // Schema: AwsSourceRegistrationParams {
  //   subscriptionType (REQUIRED, kAWSCommercial|kAWSGovCloud|kAWSC2S),
  //   standardParams?: { authMethodType, iamUserAwsCredentials? | iamRoleAwsCredentials? },
  //   useCases?
  // }
  // IamUserAwsCredentials requires { accessKey, secretAccessKey, arn }.
  server.tool(
    "register_aws_source",
    "Register an AWS account as a backup source for protecting EC2, RDS, S3, DynamoDB, and other AWS workloads",
    {
      subscription_type: z
        .enum(["kAWSCommercial", "kAWSGovCloud", "kAWSC2S"])
        .default("kAWSCommercial")
        .describe("AWS partition type"),
      auth_method: z
        .enum(["kUseIAMUser", "kUseIAMRole", "kUseInstanceProfile"])
        .default("kUseIAMUser")
        .describe("Authentication method"),
      access_key: z
        .string()
        .optional()
        .describe("IAM user access key ID (required when auth_method=kUseIAMUser)"),
      secret_access_key: z
        .string()
        .optional()
        .describe("IAM user secret access key (required when auth_method=kUseIAMUser)"),
      iam_user_arn: z
        .string()
        .optional()
        .describe("IAM user ARN (required when auth_method=kUseIAMUser)"),
      iam_role_arn: z
        .string()
        .optional()
        .describe("IAM role ARN (required when auth_method=kUseIAMRole)"),
      use_cases: z
        .array(z.enum(["kEC2", "kRDS", "kPostgres", "kDynamoDB", "kS3", "kDocumentDB", "kRedshift"]))
        .optional()
        .describe("AWS workload types to enable"),
    },
    async (args) => {
      try {
        const standardParams: Record<string, unknown> = { authMethodType: args.auth_method };

        if (args.auth_method === "kUseIAMUser") {
          if (!args.access_key || !args.secret_access_key || !args.iam_user_arn) {
            return reply(
              "kUseIAMUser requires access_key, secret_access_key, and iam_user_arn.",
              true,
            );
          }
          standardParams.iamUserAwsCredentials = {
            accessKey: args.access_key,
            secretAccessKey: args.secret_access_key,
            arn: args.iam_user_arn,
          };
        } else if (args.auth_method === "kUseIAMRole") {
          if (!args.iam_role_arn) {
            return reply("kUseIAMRole requires iam_role_arn.", true);
          }
          standardParams.iamRoleAwsCredentials = { iamRoleArn: args.iam_role_arn };
        }

        const awsParams: Record<string, unknown> = {
          subscriptionType: args.subscription_type,
          standardParams,
        };
        if (args.use_cases?.length) awsParams.useCases = args.use_cases;

        return await postRegistration(
          client,
          { environment: "kAWS", awsParams },
          `AWS ${args.subscription_type} (${args.auth_method})`,
        );
      } catch (err) {
        return reply(`Error registering AWS source: ${err}`, true);
      }
    },
  );

  // ── Microsoft 365 Tenant ───────────────────────────────────────────────
  // Schema: Office365SourceRegistrationParams extends CommonSourceRegistrationParams
  //   (which is Credentials + endpoint).
  // Plus optional: office365AppCredentialsList[{ clientId, clientSecret }],
  //   office365Region, useOAuthForExchangeOnline.
  server.tool(
    "register_m365_source",
    "Register a Microsoft 365 tenant as a backup source for protecting Exchange Online, OneDrive, SharePoint, Teams, and Groups",
    {
      endpoint: z
        .string()
        .describe("M365 endpoint, typically the tenant domain (e.g., contoso.onmicrosoft.com)"),
      username: z.string().describe("Global admin username for the M365 tenant"),
      password: z.string().describe("Password for the admin account"),
      app_credentials: z
        .array(
          z.object({
            client_id: z.string().describe("Azure AD app registration client ID"),
            client_secret: z.string().describe("Azure AD app registration client secret"),
          }),
        )
        .min(1)
        .describe("Azure AD application credentials used for Graph API access (at least one required)"),
      region: z
        .enum(["Default", "China", "Germany", "UsDoD", "UsGccHigh"])
        .optional()
        .describe("M365 region (Default for commercial, UsGccHigh for GCC High, etc.)"),
      use_oauth_for_exchange: z
        .boolean()
        .optional()
        .describe("Use OAuth for Exchange Online authentication"),
    },
    async (args) => {
      try {
        const office365Params: Record<string, unknown> = {
          endpoint: args.endpoint,
          username: args.username,
          password: args.password,
        };
        office365Params.office365AppCredentialsList = args.app_credentials.map((c) => ({
          clientId: c.client_id,
          clientSecret: c.client_secret,
        }));
        if (args.region) office365Params.office365Region = args.region;
        if (args.use_oauth_for_exchange !== undefined) {
          office365Params.useOAuthForExchangeOnline = args.use_oauth_for_exchange;
        }

        return await postRegistration(
          client,
          { environment: "kO365", office365Params },
          `M365 tenant ${args.endpoint}`,
        );
      } catch (err) {
        return reply(`Error registering M365 source: ${err}`, true);
      }
    },
  );

  // ── Generic NAS (NFS or SMB) ───────────────────────────────────────────
  // Schema: GenericNasRegistrationParams {
  //   mountPoint (REQUIRED),
  //   mode (REQUIRED, kNfs4_1|kNfs3|kCifs1),
  //   smbMountCredentials?: { username, password }, skipValidation?, description?
  // }
  server.tool(
    "register_nas_source",
    "Register a generic NAS mount point (NFS3, NFS4.1, or SMB/CIFS) as a backup source",
    {
      mount_point: z
        .string()
        .describe("Mount point of the NAS share (e.g., server:/export for NFS or \\\\server\\share for SMB)"),
      mode: z
        .enum(["kNfs3", "kNfs4_1", "kCifs1"])
        .describe("Mount protocol mode"),
      username: z
        .string()
        .optional()
        .describe("Username for SMB / CIFS authentication (required when mode=kCifs1)"),
      password: z
        .string()
        .optional()
        .describe("Password for SMB / CIFS authentication"),
      skip_validation: z
        .boolean()
        .optional()
        .describe("Skip share-reachability validation during registration"),
      description: z.string().optional().describe("Description for the NAS source"),
    },
    async (args) => {
      try {
        const genericNasParams: Record<string, unknown> = {
          mountPoint: args.mount_point,
          mode: args.mode,
        };

        if (args.mode === "kCifs1") {
          if (!args.username) {
            return reply("SMB / CIFS mode requires a username (and typically a password).", true);
          }
          genericNasParams.smbMountCredentials = {
            username: args.username,
            password: args.password ?? "",
          };
        }
        if (args.skip_validation !== undefined) genericNasParams.skipValidation = args.skip_validation;
        if (args.description) genericNasParams.description = args.description;

        return await postRegistration(
          client,
          { environment: "kGenericNas", genericNasParams },
          `NAS share ${args.mount_point}`,
        );
      } catch (err) {
        return reply(`Error registering NAS source: ${err}`, true);
      }
    },
  );

  // ── Update Registration ────────────────────────────────────────────────
  // PATCH lets callers splice in new credentials/endpoint on an existing
  // registration without restating the whole body.
  server.tool(
    "update_source_registration",
    "Update an existing source registration (rotate credentials, change endpoint, etc.). For VMware vCenter only — for other env types, use the raw API.",
    {
      registration_id: z.number().describe("Registration ID to update"),
      username: z.string().optional().describe("New username (when applicable)"),
      password: z.string().optional().describe("New password / secret (when applicable)"),
      endpoint: z.string().optional().describe("New endpoint / hostname (when applicable)"),
    },
    async (args) => {
      try {
        const current = (await client.getV2(
          `data-protect/sources/registrations/${args.registration_id}`,
        )) as Record<string, any>;

        const env = current.environment;

        if (env === "kVMware") {
          const vmware = (current.vmwareParams ?? {}) as Record<string, any>;
          const cred = vmware.vCenterParams ?? vmware.esxiParams ?? vmware.vcdParams;
          if (cred) {
            if (args.username !== undefined) cred.username = args.username;
            if (args.password !== undefined) cred.password = args.password;
            if (args.endpoint !== undefined) cred.endpoint = args.endpoint;
          }
        } else {
          return reply(
            `update_source_registration currently only covers kVMware. Got environment=${env}. For other env types, use the API directly.`,
            true,
          );
        }

        const result = await client.putV2(
          `data-protect/sources/registrations/${args.registration_id}`,
          current,
        );
        return reply(`Registration ${args.registration_id} updated.\n${JSON.stringify(result, null, 2)}`);
      } catch (err) {
        return reply(`Error updating source registration: ${err}`, true);
      }
    },
  );

  // ── S3 Compatible Source ───────────────────────────────────────────────
  // Schema: S3CompatibleSourceRegistrationParams {
  //   endpoint (REQUIRED, IP-only — no protocol prefix, no port),
  //   port (REQUIRED, int),
  //   accessKeyId (REQUIRED),
  //   secretAccessKey (REQUIRED)
  // }
  // Used to register AWS S3, MinIO, Ceph, Wasabi, Cloudian, on-prem ECS, etc.
  // For AWS S3 specifically the endpoint is the region's S3 endpoint
  // (e.g. s3.us-east-1.amazonaws.com) — Cohesity resolves the hostname.
  server.tool(
    "register_s3_compatible_source",
    "Register an S3-compatible object storage endpoint as a backup source. Use for AWS S3, MinIO, Ceph, Wasabi, on-prem ECS, or any S3 API-compatible target.",
    {
      endpoint: z
        .string()
        .describe("S3 endpoint (e.g. s3.us-east-1.amazonaws.com or 10.0.0.50). Do NOT include https:// prefix or port — those are separate fields."),
      port: z
        .number()
        .int()
        .default(443)
        .describe("TCP port (443 for AWS S3 / TLS, 9000 for default MinIO, etc.)"),
      access_key_id: z.string().describe("S3 access key ID"),
      secret_access_key: z.string().describe("S3 secret access key"),
    },
    async (args) => {
      try {
        const body = {
          environment: "kS3Compatible",
          s3CompatibleParams: {
            endpoint: args.endpoint,
            port: args.port,
            accessKeyId: args.access_key_id,
            secretAccessKey: args.secret_access_key,
          },
        };
        return await postRegistration(client, body, `S3-compatible ${args.endpoint}:${args.port}`);
      } catch (err) {
        return reply(`Error registering S3-compatible source: ${err}`, true);
      }
    },
  );

  // ── Unregister Source ──────────────────────────────────────────────────
  server.tool(
    "unregister_source",
    "Unregister (delete) a source registration. WARNING: removes the source from Cohesity but does not delete existing backups.",
    {
      registration_id: z.number().describe("Registration ID to delete"),
    },
    async (args) => {
      try {
        await client.deleteV2(`data-protect/sources/registrations/${args.registration_id}`);
        return reply(`Registration ${args.registration_id} unregistered.`);
      } catch (err) {
        return reply(`Error unregistering source: ${err}`, true);
      }
    },
  );
}
