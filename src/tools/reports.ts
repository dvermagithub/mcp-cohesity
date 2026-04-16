import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CohesityClient } from "../cohesity-client.js";

function toolResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

function usecsToDayKey(usecs: number, tzOffsetHours = 0): string {
  const ms = usecs / 1000 + tzOffsetHours * 3600000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function bytesToHuman(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function usecsToReadable(usecs: number): string {
  return new Date(usecs / 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function durationSecs(startUsecs: number, endUsecs: number): string {
  const secs = Math.round((endUsecs - startUsecs) / 1e6);
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function registerReportTools(
  server: McpServer,
  client: CohesityClient,
) {
  // ── Protected Objects Heatmap ────────────────────────────────────────
  server.tool(
    "get_protection_heatmap",
    "Generate a Protected Objects Heatmap report showing per-VM/object backup status for each day in a date range — matching the Cohesity GUI Reports > Protected Objects Heatmap view. Returns a summary (total runs, success, failed, canceled) and a per-object daily grid with run details (protection group, start time, duration, logical size, data read, status).",
    {
      days: z
        .number()
        .optional()
        .default(7)
        .describe("Number of days to look back (default: 7, max: 30)"),
      protection_group_ids: z
        .array(z.string())
        .optional()
        .describe("Filter to specific protection group IDs. Omit to include all groups."),
      environment: z
        .enum(["kVMware", "kPhysical", "kSQL", "kOracle", "kNas", "kGenericNas"])
        .optional()
        .describe("Filter by environment type"),
    },
    async ({ days, protection_group_ids, environment }) => {
      try {
        const now = Date.now() * 1000;
        const limitedDays = Math.min(days, 30);
        const startUsecs = now - limitedDays * 86400 * 1e6;

        // Step 1: Get all protection groups (or filter to requested ones)
        const groupsResult = await client.getV2("data-protect/protection-groups", {
          maxCount: "100",
          includeLastRunInfo: "false",
          ...(environment ? { environments: environment } : {}),
        }) as { protectionGroups?: Array<{ id: string; name: string; environment: string }> };

        let groups = groupsResult.protectionGroups ?? [];
        if (protection_group_ids?.length) {
          const idSet = new Set(protection_group_ids);
          groups = groups.filter(g => idSet.has(g.id));
        }

        if (groups.length === 0) {
          return toolResult("No protection groups found matching the criteria.");
        }

        // Step 2: Fetch runs with object details for each group in parallel
        const runFetches = groups.map(g =>
          client.getV2(`data-protect/protection-groups/${g.id}/runs`, {
            maxCount: "200",
            includeObjectDetails: "true",
            startTimeUsecs: String(Math.floor(startUsecs)),
            endTimeUsecs: String(Math.floor(now)),
          }).then(r => ({ group: g, result: r as { runs?: unknown[] } }))
           .catch(() => ({ group: g, result: { runs: [] } }))
        );

        const allGroupRuns = await Promise.all(runFetches);

        // Step 3: Build per-object per-day map
        type RunEntry = {
          protectionGroup: string;
          startTime: string;
          duration: string;
          logicalSize: string;
          dataRead: string;
          status: string;
          runType: string;
          isSlaViolated: boolean;
        };

        const objectMap = new Map<string, { name: string; days: Map<string, RunEntry[]> }>();

        let totalRuns = 0;
        let totalSuccess = 0;
        let totalFailed = 0;
        let totalCanceled = 0;
        let totalWarning = 0;

        for (const { group, result } of allGroupRuns) {
          const runs = (result.runs ?? []) as Array<Record<string, unknown>>;
          for (const run of runs) {
            const localInfo = run.localBackupInfo as Record<string, unknown> | undefined;
            if (!localInfo) continue;

            const runStatus = localInfo.status as string;
            const runStartUsecs = localInfo.startTimeUsecs as number;
            const runEndUsecs = localInfo.endTimeUsecs as number ?? runStartUsecs;
            const runType = (localInfo.runType as string ?? "kRegular").replace("k", "");

            totalRuns++;
            if (runStatus === "Succeeded") totalSuccess++;
            else if (runStatus === "Failed") totalFailed++;
            else if (runStatus === "Canceled") totalCanceled++;
            else if (runStatus === "SucceededWithWarning") totalWarning++;

            const dayKey = usecsToDayKey(runStartUsecs);
            const objects = (run.objects ?? []) as Array<Record<string, unknown>>;

            for (const obj of objects) {
              const objInfo = obj.object as Record<string, unknown> | undefined;
              if (!objInfo) continue;

              const objId = String(objInfo.id ?? "unknown");
              const objName = String(objInfo.name ?? "unknown");
              const snapInfo = (obj.localSnapshotInfo as Record<string, unknown>)?.snapshotInfo as Record<string, unknown> | undefined;
              const objStatus = String(snapInfo?.status ?? runStatus ?? "Unknown").replace("kSuccessful", "Succeeded").replace("kFailed", "Failed").replace("kCanceled", "Canceled").replace("kWarning", "Warning");
              const stats = snapInfo?.stats as Record<string, unknown> | undefined;
              const logicalBytes = stats?.logicalSizeBytes as number ?? 0;
              const bytesRead = stats?.bytesRead as number ?? (localInfo.localSnapshotStats as Record<string, unknown>)?.bytesRead as number ?? 0;
              const objStart = snapInfo?.startTimeUsecs as number ?? runStartUsecs;
              const objEnd = snapInfo?.endTimeUsecs as number ?? runEndUsecs;

              if (!objectMap.has(objId)) {
                objectMap.set(objId, { name: objName, days: new Map() });
              }
              const entry = objectMap.get(objId)!;
              if (!entry.days.has(dayKey)) entry.days.set(dayKey, []);

              entry.days.get(dayKey)!.push({
                protectionGroup: group.name,
                startTime: usecsToReadable(objStart),
                duration: durationSecs(objStart, objEnd),
                logicalSize: bytesToHuman(logicalBytes),
                dataRead: bytesToHuman(bytesRead),
                status: objStatus,
                runType,
                isSlaViolated: !!(localInfo.isSlaViolated),
              });
            }
          }
        }

        // Step 4: Build output
        const startDate = new Date(startUsecs / 1000).toISOString().slice(0, 10);
        const endDate = new Date(now / 1000).toISOString().slice(0, 10);

        const output: Record<string, unknown> = {
          report: "Protected Objects Heatmap",
          dateRange: `${startDate} to ${endDate}`,
          summary: {
            totalRuns,
            succeeded: totalSuccess,
            succeededWithWarning: totalWarning,
            failed: totalFailed,
            canceled: totalCanceled,
            totalObjects: objectMap.size,
          },
          objects: [] as unknown[],
        };

        // Build day list
        const dayList: string[] = [];
        for (let i = limitedDays - 1; i >= 0; i--) {
          dayList.push(new Date((now / 1000) - i * 86400000).toISOString().slice(0, 10));
        }

        for (const [, objData] of objectMap) {
          const heatmap: Record<string, unknown> = {};
          let objSuccess = 0;
          let objFailed = 0;
          let objTotal = 0;

          for (const day of dayList) {
            const runs = objData.days.get(day);
            if (runs?.length) {
              heatmap[day] = runs;
              objTotal += runs.length;
              for (const r of runs) {
                if (r.status === "Succeeded") objSuccess++;
                else objFailed++;
              }
            } else {
              heatmap[day] = null;
            }
          }

          (output.objects as unknown[]).push({
            name: objData.name,
            successRate: objTotal > 0 ? `${Math.round(objSuccess / objTotal * 100)}%` : "N/A",
            totalRuns: objTotal,
            heatmap,
          });
        }

        return toolResult(JSON.stringify(output, null, 2));
      } catch (error) {
        return toolResult(`Error generating protection heatmap: ${error}`, true);
      }
    },
  );

  // ── Protection Summary Report ─────────────────────────────────────────
  server.tool(
    "get_protection_summary",
    "Generate a protection job summary report showing overall backup health: success/failure counts, SLA violations, and a list of failing protection groups with their last run status. Good for daily operational review.",
    {
      days: z
        .number()
        .optional()
        .default(1)
        .describe("Number of days to look back (default: 1 for daily review, max: 30)"),
    },
    async ({ days }) => {
      try {
        const now = Date.now() * 1000;
        const limitedDays = Math.min(days, 30);
        const startUsecs = now - limitedDays * 86400 * 1e6;

        // Get all groups with last run info
        const groupsResult = await client.getV2("data-protect/protection-groups", {
          maxCount: "200",
          includeLastRunInfo: "true",
        }) as { protectionGroups?: Array<Record<string, unknown>> };

        const groups = groupsResult.protectionGroups ?? [];

        // Get run stats for the period
        const statsResult = await client.getV2("stats/protection-runs", {
          startTimeUsecs: String(Math.floor(startUsecs)),
          endTimeUsecs: String(Math.floor(now)),
        }) as { protectionRunsStatsList?: Array<{ timestamp: number; stats: Array<{ protectionRunStatus: string; protectionRunsCount: number }> }> };

        // Aggregate stats across all time buckets
        const statTotals: Record<string, number> = {};
        for (const bucket of statsResult.protectionRunsStatsList ?? []) {
          for (const s of bucket.stats ?? []) {
            statTotals[s.protectionRunStatus] = (statTotals[s.protectionRunStatus] ?? 0) + s.protectionRunsCount;
          }
        }

        // Identify problem groups from last run info
        const failingGroups: unknown[] = [];
        const warningGroups: unknown[] = [];
        const slaViolations: unknown[] = [];
        let activeGroups = 0;
        let pausedGroups = 0;

        for (const g of groups) {
          if (g.isPaused) { pausedGroups++; continue; }
          activeGroups++;

          const lastRun = g.lastRun as Record<string, unknown> | undefined;
          const localInfo = lastRun?.localBackupInfo as Record<string, unknown> | undefined;
          if (!localInfo) continue;

          const status = localInfo.status as string;
          const lastRunStart = localInfo.startTimeUsecs as number ?? 0;

          if (lastRunStart < startUsecs) continue; // outside the window

          if (status === "Failed") {
            failingGroups.push({
              name: g.name,
              id: g.id,
              environment: g.environment,
              lastRunStatus: status,
              lastRunTime: usecsToReadable(lastRunStart),
              failedObjects: localInfo.failedObjectsCount ?? 0,
              successfulObjects: localInfo.successfulObjectsCount ?? 0,
            });
          } else if (status === "SucceededWithWarning") {
            warningGroups.push({
              name: g.name,
              id: g.id,
              lastRunTime: usecsToReadable(lastRunStart),
              failedObjects: localInfo.failedObjectsCount ?? 0,
            });
          }

          if (localInfo.isSlaViolated) {
            slaViolations.push({
              name: g.name,
              lastRunTime: usecsToReadable(lastRunStart),
              status,
            });
          }
        }

        const total = Object.values(statTotals).reduce((a, b) => a + b, 0);
        const output = {
          report: "Protection Summary",
          dateRange: `Last ${limitedDays} day(s)`,
          summary: {
            totalRuns: total,
            succeeded: statTotals["Succeeded"] ?? 0,
            succeededWithWarning: statTotals["SucceededWithWarning"] ?? 0,
            failed: statTotals["Failed"] ?? 0,
            canceled: statTotals["Canceled"] ?? 0,
            running: statTotals["Running"] ?? 0,
            successRate: total > 0 ? `${Math.round(((statTotals["Succeeded"] ?? 0) + (statTotals["SucceededWithWarning"] ?? 0)) / total * 100)}%` : "N/A",
          },
          protectionGroups: {
            active: activeGroups,
            paused: pausedGroups,
            total: groups.length,
          },
          slaViolations: { count: slaViolations.length, groups: slaViolations },
          failingGroups: { count: failingGroups.length, groups: failingGroups },
          warningGroups: { count: warningGroups.length, groups: warningGroups },
        };

        return toolResult(JSON.stringify(output, null, 2));
      } catch (error) {
        return toolResult(`Error generating protection summary: ${error}`, true);
      }
    },
  );

  // ── Recovery Summary Report ───────────────────────────────────────────
  server.tool(
    "get_recovery_summary",
    "Generate a recovery activity summary showing how many objects were recovered, recovery task statuses, and recent recovery operations in a time window.",
    {
      days: z
        .number()
        .optional()
        .default(7)
        .describe("Number of days to look back (default: 7)"),
    },
    async ({ days }) => {
      try {
        const now = Date.now() * 1000;
        const limitedDays = Math.min(days, 90);
        const startUsecs = now - limitedDays * 86400 * 1e6;

        const [statsResult, tasksResult] = await Promise.all([
          client.getV2("stats/recoveries", {
            startTimeUsecs: String(Math.floor(startUsecs)),
            endTimeUsecs: String(Math.floor(now)),
          }) as Promise<Record<string, unknown>>,
          client.getV2("data-protect/recoveries", {
            maxCount: "25",
            startTimeUsecs: String(Math.floor(startUsecs)),
          }) as Promise<{ recoveries?: Array<Record<string, unknown>> }>,
        ]);

        const recoveries = tasksResult.recoveries ?? [];
        const statusCounts: Record<string, number> = {};
        for (const rec of recoveries) {
          const s = String(rec.status ?? "Unknown");
          statusCounts[s] = (statusCounts[s] ?? 0) + 1;
        }

        const output = {
          report: "Recovery Summary",
          dateRange: `Last ${limitedDays} day(s)`,
          stats: statsResult,
          taskStatusBreakdown: statusCounts,
          recentTasks: recoveries.map(r => ({
            id: r.id,
            name: r.name,
            status: r.status,
            environment: r.snapshotEnvironment,
            recoveryAction: r.recoveryAction,
            startTime: r.startTimeUsecs ? usecsToReadable(r.startTimeUsecs as number) : null,
            objectCount: r.numObjects,
            createdBy: (r.creationInfo as Record<string, unknown>)?.userName,
          })),
        };

        return toolResult(JSON.stringify(output, null, 2));
      } catch (error) {
        return toolResult(`Error generating recovery summary: ${error}`, true);
      }
    },
  );
}
