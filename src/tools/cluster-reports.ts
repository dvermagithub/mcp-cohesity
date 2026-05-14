/**
 * Cluster-local report tools — synthesize backup, recovery, and capacity
 * reports from cluster V1 + V2 endpoints. No Helios required.
 *
 * Most reports are derived: we combine multiple endpoints into a single
 * tool result that an LLM (or operator) can read at a glance.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

const reply = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

/** Convert bytes to a human-readable string. */
function fmtBytes(n: number | undefined | null): string {
  if (n == null) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(2)} ${units[i]}`;
}

/** Convert microseconds since epoch to an ISO date string. */
function fmtUsecs(usecs: number | undefined | null): string {
  if (!usecs) return "—";
  return new Date(usecs / 1000).toISOString();
}

export function registerClusterReportTools(server: McpServer, client: CohesityClient): void {
  // ── Protected Objects Trend Report (V1) ────────────────────────────────
  // /irisservices/api/v1/public/reports/protectedObjectsTrends
  // Returns per-object backup success/fail history rolled up by day/week.
  server.tool(
    "get_protected_objects_trend_report",
    "Get a per-object backup success/failure trend report over a time window. Returns each protected object with daily or weekly rollups of total, successful, running, cancelled, and failed runs.",
    {
      start_time_msecs: z
        .number()
        .describe("Window start in unix milliseconds (NOT microseconds — V1 endpoint uses msec)"),
      end_time_msecs: z.number().describe("Window end in unix milliseconds"),
      rollup_interval_days: z
        .number()
        .default(1)
        .describe("Days per rollup bucket (1=daily, 7=weekly, 30=monthly)"),
      timezone: z
        .string()
        .default("UTC")
        .describe("IANA timezone for date bucketing (e.g. UTC, America/New_York)"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {
          startTimeMsecs: String(args.start_time_msecs),
          endTimeMsecs: String(args.end_time_msecs),
          rollupIntervalDays: String(args.rollup_interval_days),
          timezone: args.timezone,
        };
        const data = await client.getV1("reports/protectedObjectsTrends", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching trend report: ${err}`, true);
      }
    },
  );

  // ── Sources × Jobs Summary Report (V1) ─────────────────────────────────
  // /irisservices/api/v1/public/reports/protectionSourcesJobsSummary
  // Which sources are in which protection groups, with run counts.
  server.tool(
    "get_sources_jobs_summary_report",
    "Get a report mapping protection sources to the protection groups (jobs) covering them, with run counts per source.",
    {},
    async () => {
      try {
        const data = await client.getV1("reports/protectionSourcesJobsSummary");
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching sources/jobs summary: ${err}`, true);
      }
    },
  );

  // ── Archival Data Transfer Report (V1) ─────────────────────────────────
  // /irisservices/api/v1/public/reports/dataTransferToVaults
  server.tool(
    "get_archival_transfer_report",
    "Get a report of data transferred to external archival targets (vaults) in a given time window.",
    {
      start_time_msecs: z.number().describe("Window start in unix milliseconds"),
      end_time_msecs: z.number().describe("Window end in unix milliseconds"),
      timezone: z.string().default("UTC").describe("IANA timezone for date bucketing"),
    },
    async (args) => {
      try {
        const qp: Record<string, string> = {
          startTimeMsecs: String(args.start_time_msecs),
          endTimeMsecs: String(args.end_time_msecs),
          timezone: args.timezone,
        };
        const data = await client.getV1("reports/dataTransferToVaults", qp);
        return reply(JSON.stringify(data, null, 2));
      } catch (err) {
        return reply(`Error fetching archival transfer report: ${err}`, true);
      }
    },
  );

  // ── Synthesized Protection Summary Report ──────────────────────────────
  // Combines protection-groups + last-run-info + alerts into a Markdown
  // summary suitable for an LLM to relay to the operator.
  server.tool(
    "generate_protection_summary_report",
    "Generate a synthesized Markdown protection summary report: protection groups, their last run status, and any active alerts. Combines multiple V2 endpoints into one human-readable view.",
    {
      include_resolved_alerts: z
        .boolean()
        .default(false)
        .describe("Include resolved alerts (default: only open alerts)"),
    },
    async (args) => {
      try {
        const [groupsResp, alertsResp] = await Promise.all([
          client.getV2("data-protect/protection-groups", {
            includeLastRunInfo: "true",
          }),
          client.getV2("alerts", {
            alertStates: args.include_resolved_alerts ? "kOpen,kResolved" : "kOpen",
            maxAlerts: "100",
          }),
        ]);

        const groups =
          ((groupsResp as Record<string, any>).protectionGroups as any[] | undefined) ?? [];
        const alerts = ((alertsResp as Record<string, any>).alerts as any[] | undefined) ?? [];

        const lines: string[] = [];
        lines.push("# Protection Summary Report");
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push("");
        lines.push(`## Protection Groups (${groups.length})`);
        lines.push("");
        lines.push("| Name | Environment | Policy | Last Run | Status | Logical |");
        lines.push("|---|---|---|---|---|---|");

        for (const g of groups) {
          const lastRun = g.lastRun ?? {};
          const localRun = lastRun.localBackupInfo ?? {};
          lines.push(
            `| ${g.name ?? "—"} | ${g.environment ?? "—"} | ${g.policyId ?? "—"} ` +
              `| ${fmtUsecs(localRun.startTimeUsecs)} | ${localRun.status ?? "—"} ` +
              `| ${fmtBytes(localRun.localSnapshotStats?.logicalSizeBytes)} |`,
          );
        }

        lines.push("");
        lines.push(`## Alerts (${alerts.length})`);
        lines.push("");
        if (alerts.length === 0) {
          lines.push("_No alerts in the selected window._");
        } else {
          lines.push("| Severity | Category | Created | Message |");
          lines.push("|---|---|---|---|");
          for (const a of alerts.slice(0, 50)) {
            const created = fmtUsecs(a.firstTimestampUsecs);
            const msg = (a.alertDocument?.alertDescription ?? a.errorMessage ?? "—")
              .replace(/\|/g, "\\|")
              .replace(/\n/g, " ")
              .slice(0, 120);
            lines.push(
              `| ${a.severity ?? "—"} | ${a.alertCategory ?? "—"} | ${created} | ${msg} |`,
            );
          }
        }

        return reply(lines.join("\n"));
      } catch (err) {
        return reply(`Error generating protection summary: ${err}`, true);
      }
    },
  );

  // ── Synthesized Failed Backups Report ──────────────────────────────────
  // Combines protection-groups + last-run-info to surface only failed/missed runs.
  server.tool(
    "generate_failed_backups_report",
    "Generate a Markdown report listing protection groups whose most recent run failed, was missed, or finished with warnings. Useful for daily backup health triage.",
    {},
    async () => {
      try {
        const groupsResp = await client.getV2("data-protect/protection-groups", {
          includeLastRunInfo: "true",
        });
        const groups =
          ((groupsResp as Record<string, any>).protectionGroups as any[] | undefined) ?? [];

        const bad = groups.filter((g) => {
          const status = g.lastRun?.localBackupInfo?.status;
          return ["Failed", "Missed", "SucceededWithWarning", "Canceled"].includes(status);
        });

        const lines: string[] = [];
        lines.push("# Failed / Missed Backups Report");
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push(`Failing groups: ${bad.length} of ${groups.length}`);
        lines.push("");

        if (bad.length === 0) {
          lines.push("_All protection groups' last runs completed successfully._");
          return reply(lines.join("\n"));
        }

        lines.push("| Name | Environment | Status | Last Run | Run ID |");
        lines.push("|---|---|---|---|---|");
        for (const g of bad) {
          const run = g.lastRun?.localBackupInfo ?? {};
          lines.push(
            `| ${g.name ?? "—"} | ${g.environment ?? "—"} | ${run.status ?? "—"} ` +
              `| ${fmtUsecs(run.startTimeUsecs)} | ${g.lastRun?.id ?? "—"} |`,
          );
        }

        return reply(lines.join("\n"));
      } catch (err) {
        return reply(`Error generating failed-backups report: ${err}`, true);
      }
    },
  );

  // ── Synthesized Capacity Report ────────────────────────────────────────
  // Combines /clusters + /stats/cluster-storage into a single capacity view.
  server.tool(
    "generate_capacity_report",
    "Generate a Markdown capacity report showing cluster storage usage, available capacity, deduplication ratio, and data reduction stats.",
    {},
    async () => {
      try {
        const [clusterResp, storageResp] = await Promise.all([
          client.getV2("clusters"),
          client.getV2("stats/cluster-storage"),
        ]);
        const cluster = clusterResp as Record<string, any>;
        const storage = storageResp as Record<string, any>;
        const stats = storage.totalClusterUsage ?? storage;

        const lines: string[] = [];
        lines.push("# Cluster Capacity Report");
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push("");
        lines.push(`**Cluster:** ${cluster.name ?? "—"} (id ${cluster.id ?? "—"})`);
        lines.push(`**Software:** ${cluster.softwareVersion ?? "—"}`);
        lines.push(`**Nodes:** ${cluster.nodeCount ?? "—"}`);
        lines.push("");
        lines.push("## Storage");
        lines.push("");
        lines.push(`- **Total capacity:** ${fmtBytes(stats.totalPhysicalRawUsageBytes)}`);
        lines.push(`- **Used:** ${fmtBytes(stats.totalPhysicalUsageBytes)}`);
        lines.push(`- **Free:** ${fmtBytes(stats.totalCapacityBytes - stats.totalPhysicalUsageBytes)}`);
        lines.push(`- **Logical (pre-dedup):** ${fmtBytes(stats.totalLogicalUsageBytes)}`);
        if (stats.dataReductionRatio !== undefined) {
          lines.push(`- **Data reduction:** ${stats.dataReductionRatio.toFixed(2)}x`);
        }

        return reply(lines.join("\n"));
      } catch (err) {
        return reply(`Error generating capacity report: ${err}`, true);
      }
    },
  );
}
