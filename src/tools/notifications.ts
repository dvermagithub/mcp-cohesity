import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

const ALERT_CATEGORIES = [
  "kDisk", "kNode", "kCluster", "kChassis", "kPowerSupply", "kCPU", "kMemory",
  "kTemperature", "kFan", "kNIC", "kFirmware", "kNodeHealth", "kOperatingSystem",
  "kDataPath", "kMetadata", "kIndexing", "kHelios", "kSystemService", "kLicense",
  "kSecurity", "kUpgrade", "kClusterManagement", "kAuditLog", "kNetworking",
  "kConfiguration", "kStorageUsage", "kFaultTolerance", "kBackupRestore",
  "kArchivalRestore", "kRemoteReplication", "kQuota", "kCDP", "kDisasterRecovery",
  "kAgent",
] as const;

export function registerNotificationTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── List Notification Rules ──────────────────────────────────────────
  server.tool(
    "list_notification_rules",
    "List all alert notification rules. Each rule defines which alert categories/severities trigger email, SNMP, syslog, or webhook notifications.",
    {
      ids: z
        .array(z.number())
        .optional()
        .describe("Filter by specific rule IDs. Omit to return all rules."),
    },
    async ({ ids }) => {
      try {
        const params: Record<string, string> = {};
        if (ids) params.ids = ids.join(",");

        const result = await client.getV2("alerts/config/notification-rules", params);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error listing notification rules: ${error}`, true);
      }
    },
  );

  // ── Create Notification Rule ─────────────────────────────────────────
  server.tool(
    "create_notification_rule",
    "Create an alert notification rule to send emails or webhooks when specific alert categories or severities occur.",
    {
      rule_name: z.string().describe("Name for the notification rule"),
      categories: z
        .array(z.enum(ALERT_CATEGORIES))
        .optional()
        .describe("Alert categories this rule applies to (e.g. kBackupRestore, kDisasterRecovery, kSecurity)"),
      severities: z
        .array(z.enum(["kCritical", "kWarning", "kInfo"]))
        .optional()
        .describe("Alert severity levels this rule applies to"),
      email_addresses: z
        .array(z.string())
        .optional()
        .describe("Email addresses to notify (e.g. ['admin@example.com'])"),
      webhook_url: z
        .string()
        .optional()
        .describe("Webhook URL to POST alert payload to (e.g. Slack, PagerDuty, Teams)"),
      snmp_enabled: z
        .boolean()
        .optional()
        .default(false)
        .describe("Enable SNMP trap notifications"),
      syslog_enabled: z
        .boolean()
        .optional()
        .default(false)
        .describe("Enable syslog notifications"),
    },
    async ({ rule_name, categories, severities, email_addresses, webhook_url, snmp_enabled, syslog_enabled }) => {
      try {
        const body: Record<string, unknown> = {
          ruleName: rule_name,
          snmpEnabled: snmp_enabled,
          syslogEnabled: syslog_enabled,
        };

        if (categories) body.categories = categories;
        if (severities) body.severities = severities;

        if (email_addresses?.length) {
          body.emailDeliveryTargets = email_addresses.map((email) => ({
            emailAddress: email,
          }));
        }

        if (webhook_url) {
          body.webhookDeliveryTargets = [{ url: webhook_url }];
        }

        const result = await client.postV2("alerts/config/notification-rules", body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error creating notification rule: ${error}`, true);
      }
    },
  );

  // ── Update Notification Rule ─────────────────────────────────────────
  server.tool(
    "update_notification_rule",
    "Update an existing alert notification rule by ID.",
    {
      id: z.number().describe("Notification rule ID to update"),
      rule_name: z.string().describe("Rule name"),
      categories: z
        .array(z.enum(ALERT_CATEGORIES))
        .optional()
        .describe("Alert categories this rule applies to"),
      severities: z
        .array(z.enum(["kCritical", "kWarning", "kInfo"]))
        .optional()
        .describe("Alert severity levels"),
      email_addresses: z
        .array(z.string())
        .optional()
        .describe("Email addresses to notify"),
      webhook_url: z
        .string()
        .optional()
        .describe("Webhook URL"),
      snmp_enabled: z
        .boolean()
        .optional()
        .default(false)
        .describe("Enable SNMP trap notifications"),
      syslog_enabled: z
        .boolean()
        .optional()
        .default(false)
        .describe("Enable syslog notifications"),
    },
    async ({ id, rule_name, categories, severities, email_addresses, webhook_url, snmp_enabled, syslog_enabled }) => {
      try {
        const body: Record<string, unknown> = {
          ruleName: rule_name,
          snmpEnabled: snmp_enabled,
          syslogEnabled: syslog_enabled,
        };

        if (categories) body.categories = categories;
        if (severities) body.severities = severities;

        if (email_addresses?.length) {
          body.emailDeliveryTargets = email_addresses.map((email) => ({
            emailAddress: email,
          }));
        }

        if (webhook_url) {
          body.webhookDeliveryTargets = [{ url: webhook_url }];
        }

        const result = await client.putV2(`alerts/config/notification-rules/${id}`, body);
        return toolResult(JSON.stringify(result, null, 2));
      } catch (error) {
        return toolResult(`Error updating notification rule ${id}: ${error}`, true);
      }
    },
  );

  // ── Delete Notification Rule ─────────────────────────────────────────
  server.tool(
    "delete_notification_rule",
    "Delete an alert notification rule by ID.",
    {
      id: z.number().describe("Notification rule ID to delete"),
    },
    async ({ id }) => {
      try {
        await client.deleteV2(`alerts/config/notification-rules/${id}`);
        return toolResult(`Notification rule ${id} deleted successfully.`);
      } catch (error) {
        return toolResult(`Error deleting notification rule ${id}: ${error}`, true);
      }
    },
  );
}
