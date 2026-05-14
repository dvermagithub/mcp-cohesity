# mcp-cohesity

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for **Cohesity DataProtect**, providing AI assistants with deep coverage of Cohesity's REST API: registration, backup, recovery, retention/WORM, archival, monitoring, reporting, identity, and audit.

> Inspired by [fredriksknese/mcp-cohesity](https://github.com/fredriksknese/mcp-cohesity). Entirely rewritten from scratch.

**107 tools across 23 categories**, every tool driven by the cluster's OpenAPI v2 spec and live-validated against a real cluster.

A full QA test report covering every tool is checked into [tests/TEST_REPORT.md](tests/TEST_REPORT.md), and the harness that produced it ([tests/qa-harness.mjs](tests/qa-harness.mjs)) can be re-run against any cluster.

---

## Quick Tool Index

| Category | Tools |
|---|---|
| [Cluster](#cluster-2-tools) | 2 |
| [Source Registration](#source-registration-8-tools) | 8 |
| [Protection Sources](#protection-sources-4-tools) | 4 |
| [Protection Policies](#protection-policies-4-tools) | 4 |
| [Protection Groups](#protection-groups-8-tools) | 8 |
| [Backup Runs](#backup-runs-2-tools) | 2 |
| [Run Actions & Snapshot Management](#run-actions--snapshot-management-6-tools) | 6 |
| [Storage & Objects](#storage--objects-4-tools) | 4 |
| [Recovery & File Restore](#recovery--file-restore-6-tools) | 6 |
| [Alerts](#alerts-2-tools) | 2 |
| [Alert Notification Rules](#alert-notification-rules-4-tools) | 4 |
| [External Targets](#external-targets-5-tools) | 5 |
| [Data Tiering](#data-tiering-6-tools) | 6 |
| [Reports](#reports-3-tools) | 3 |
| [Cluster-Local Reports](#cluster-local-reports-6-tools) | 6 |
| [Stats](#stats-6-tools) | 6 |
| [Audit Logs](#audit-logs-3-tools) | 3 |
| [Users](#users-6-tools) | 6 |
| [Roles](#roles-4-tools) | 4 |
| [Active Directory](#active-directory-3-tools) | 3 |
| [Antivirus / Threat Detection](#antivirus--threat-detection-7-tools) | 7 |
| [KMS / Encryption Keys](#kms--encryption-keys-6-tools) | 6 |
| [Clones](#clones-3-tools) | 3 |

---

## Tool Reference

### Cluster (2 tools)

| Tool | Description |
|---|---|
| `get_cluster_info` | Cluster name, ID, software version, node count |
| `get_cluster_stats` | Storage capacity and throughput statistics |

### Source Registration (8 tools)

Register new backup sources end-to-end — every shape verified against the cluster's `SourceRegistrationRequestParams` schema.

| Tool | Description |
|---|---|
| `register_vmware_source` | Register a vCenter, ESXi standalone host, or vCloud Director endpoint |
| `register_physical_source` | Register a physical Linux / Windows / AIX / Solaris / SAP HANA server |
| `register_azure_source` | Register an Azure tenant or subscription (VM, SQL, Files, Blob, etc.) |
| `register_aws_source` | Register an AWS account (EC2, RDS, S3, DynamoDB, etc.) |
| `register_m365_source` | Register a Microsoft 365 tenant (Exchange, OneDrive, SharePoint, Teams, Groups) |
| `register_nas_source` | Register a generic NAS mount (NFS3, NFS4.1, SMB/CIFS) |
| `update_source_registration` | Rotate credentials or change endpoint on an existing registration |
| `unregister_source` | Delete a source registration (does not delete backups) |

### Protection Sources (4 tools)

| Tool | Description |
|---|---|
| `list_sources` | List all registered sources |
| `get_source` | Get full object hierarchy details for a source |
| `search_objects` | Search for protectable objects across all sources (auto-refreshes first) |
| `refresh_source` | Re-discover inventory from a registered source (e.g. vCenter) |

### Protection Policies (4 tools)

| Tool | Description |
|---|---|
| `list_protection_policies` | List all data protection policies |
| `create_protection_policy` | Create a policy with incremental/full schedules, GFS retention, DataLock |
| `update_protection_policy` | Update an existing policy |
| `delete_protection_policy` | Delete a policy |

### Protection Groups (8 tools)

| Tool | Description |
|---|---|
| `list_protection_groups` | List protection groups (backup jobs) with status and schedule |
| `get_protection_group` | Get detailed configuration of a specific group |
| `create_protection_group` | Create a new protection group for VMware, Physical, SQL, etc. |
| `update_protection_group` | Update a group (add/remove VMs, change policy, enable indexing) |
| `delete_protection_group` | Delete a group and optionally its snapshots |
| `run_protection_group` | Trigger an on-demand backup run |
| `pause_protection_group` | Pause scheduled backups |
| `resume_protection_group` | Resume a paused group |

### Backup Runs (2 tools)

| Tool | Description |
|---|---|
| `list_protection_runs` | List recent backup runs with status, duration, and data size |
| `get_protection_run` | Get detailed information about a specific run |

### Run Actions & Snapshot Management (6 tools)

WORM, legal hold, retention adjustments, and run cancellation.

| Tool | Description |
|---|---|
| `cancel_protection_run` | Cancel a running protection group run (whole or per-object/copy) |
| `cancel_recovery_task` | Cancel an in-flight recovery task |
| `set_snapshot_datalock` | Apply DataLock (Compliance or Administrative WORM) to a snapshot |
| `set_snapshot_legal_hold` | Place a snapshot on legal hold or release it (requires Data Security Role) |
| `extend_snapshot_retention` | Extend or shorten a snapshot's retention by N days |
| `delete_snapshot` | Delete a snapshot immediately (irreversible, blocked by DataLock/Legal Hold) |

### Storage & Objects (4 tools)

| Tool | Description |
|---|---|
| `list_storage_domains` | List storage domains (view boxes) |
| `list_objects` | List protectable objects under a source |
| `list_snapshots` | List available snapshots for an object |
| `browse_snapshot_files` | Browse files inside a VM snapshot via V2 indexed search |

### Recovery & File Restore (6 tools)

| Tool | Description |
|---|---|
| `list_recovery_tasks` | List recovery tasks with status |
| `get_recovery_task` | Get detailed info about a recovery task |
| `recover_vm` | Recover a VM from a snapshot (instant recovery or full clone) |
| `search_files` | Search for files across all indexed backups |
| `recover_files` | Recover specific files to original or alternate location (LVM-aware) |
| `cancel_recovery_task` | *(see Run Actions above)* |

### Alerts (2 tools)

| Tool | Description |
|---|---|
| `list_alerts` | List alerts filtered by severity, category, state |
| `resolve_alert` | Mark an alert as resolved with resolution notes |

### Alert Notification Rules (4 tools)

| Tool | Description |
|---|---|
| `list_notification_rules` | List all alert notification rules |
| `create_notification_rule` | Create an email / webhook / SNMP / syslog rule |
| `update_notification_rule` | Update a notification rule |
| `delete_notification_rule` | Delete a notification rule |

### External Targets (5 tools)

| Tool | Description |
|---|---|
| `list_external_targets` | List registered external targets (S3, Azure Blob, NAS, tape) |
| `get_external_target` | Get details of a specific target |
| `create_external_target_aws` | Register an AWS S3 external target |
| `create_external_target_azure` | Register an Azure Blob Storage external target |
| `delete_external_target` | Delete an external target |

### Data Tiering (6 tools)

| Tool | Description |
|---|---|
| `list_tiering_tasks` | List all data tiering tasks |
| `get_tiering_task` | Get details of a tiering task |
| `create_tiering_task` | Create a task to move cold data to external target |
| `run_tiering_task` | Trigger an on-demand tiering run |
| `update_tiering_task_state` | Pause or resume a tiering task |
| `delete_tiering_task` | Delete a tiering task |

### Reports (3 tools)

V2 protection summary reports.

| Tool | Description |
|---|---|
| `get_protection_heatmap` | Per-VM per-day protection status grid (matches GUI heatmap) |
| `get_protection_summary` | Overall protection run statistics |
| `get_recovery_summary` | Recovery task statistics for a time range |

### Cluster-Local Reports (6 tools)

Reports derived from V1 cluster-local endpoints plus synthesized Markdown reports — **no Helios required**.

| Tool | Description |
|---|---|
| `get_protected_objects_trend_report` | Per-object backup success/failure trends with daily/weekly rollups |
| `get_sources_jobs_summary_report` | Sources × jobs matrix |
| `get_archival_transfer_report` | Data transferred to external archival targets |
| `generate_protection_summary_report` | Synthesized Markdown report of protection groups + active alerts |
| `generate_failed_backups_report` | Markdown list of protection groups whose last run failed/missed |
| `generate_capacity_report` | Markdown capacity report (cluster storage, dedup, data reduction) |

### Stats (6 tools)

| Tool | Description |
|---|---|
| `get_cluster_storage_stats` | Detailed storage breakdown including data reduction ratios |
| `get_workload_stats` | Data volumes and counts per workload (VMware, Physical, NAS, SQL) |
| `get_replication_backlog` | Pending replication data to remote clusters |
| `get_replication_clusters` | List replication partner clusters with total replicated |
| `get_replication_data_trend` | Time-series replication throughput |
| `get_replication_objects` | Objects replicated to/from remote clusters in a time range |

### Audit Logs (3 tools)

| Tool | Description |
|---|---|
| `list_audit_logs` | Query the cluster audit log (users, actions, entity types, time window, search) |
| `list_audit_log_actions` | List all action types recognized by the audit log |
| `list_audit_log_entity_types` | List all entity types tracked in the audit log |

### Users (6 tools)

| Tool | Description |
|---|---|
| `list_users` | List Cohesity users (filter by domain, sid, username, email, role) |
| `get_user` | Get a single user by SID |
| `create_local_user` | Create a LOCAL Cohesity user with a password |
| `create_ad_user` | Map an existing AD / IdP principal as a Cohesity user |
| `update_user` | Update user roles, description, password, or restricted flag |
| `delete_users` | Delete one or more users by SID |

### Roles (4 tools)

| Tool | Description |
|---|---|
| `list_roles` | List built-in and custom Cohesity roles |
| `create_role` | Create a custom role with a privilege set |
| `update_role` | Update a role's privileges (replace, not merge) |
| `delete_role` | Delete a custom role (built-in roles cannot be deleted) |

### Active Directory (3 tools)

| Tool | Description |
|---|---|
| `list_active_directories` | List AD domains joined to the cluster |
| `join_active_directory` | Join the cluster to an AD domain |
| `leave_active_directory` | Remove an AD from the cluster |

### Antivirus / Threat Detection (7 tools)

On-prem ICAP-based antivirus. (Anomaly / ransomware behavioural detection is a Helios-only SaaS feature and is not exposed on standalone clusters.)

| Tool | Description |
|---|---|
| `list_antivirus_groups` | List antivirus service groups (each bundles ICAP servers) |
| `create_antivirus_group` | Create a new antivirus group with one or more ICAP services |
| `get_antivirus_group` | Get a single antivirus group by ID |
| `update_antivirus_group` | Update an antivirus group's name, services, or state |
| `delete_antivirus_group` | Delete an antivirus group |
| `check_icap_connection` | Probe an ICAP URI and return reachability |
| `list_infected_files` | List files an antivirus service has flagged as infected |

### KMS / Encryption Keys (6 tools)

| Tool | Description |
|---|---|
| `list_kms_configurations` | List Key Management Systems (Internal, AWS, KMIP, IBM, GCP) |
| `add_aws_kms` | Register an AWS KMS as an encryption key source |
| `add_kmip_kms` | Register a KMIP-compliant KMS (Thales, Fortanix, etc.) |
| `update_kms` | Update assignments or rename an existing KMS |
| `delete_kms` | Delete a KMS configuration (internal KMS cannot be deleted) |
| `get_external_target_encryption_key` | Get the encryption key associated with an external target |

### Clones (3 tools)

| Tool | Description |
|---|---|
| `list_clone_tasks` | List active and historical clone tasks (CloneVMs, CloneView, CloneAppView) |
| `clone_view` | Clone a file-services View into a new space-efficient View |
| `delete_clone_task` | Delete a restore clone task and release its space |

---

## Key Engineering Notes

- **Spec-driven** — every tool's request/response shape is modeled directly from the cluster's OpenAPI v2 spec (`SourceRegistrationRequestParams`, `AuditLog`, `UpdateLocalSnapshotConfig`, etc.), not guessed.
- **Live-validated** — write tools were probed against a real cluster to confirm the cluster accepts the payload shape before shipping.
- **Auto source refresh** — all CRUD operations (create/update/delete groups, search objects, register source) automatically refresh registered sources so the cluster sees current inventory.
- **LVM volume path handling** — `recover_files` to original path on LVM-based Linux VMs works correctly by transparently using `alternatePath` to handle Cohesity's `lvol_N/` prefix.
- **Indexed file browsing** — `browse_snapshot_files` uses V2 `search/indexed-objects` with `objectIds` scoping to a single VM, and auto-derives search terms from the last path segment (requires indexing enabled on the protection group).
- **GFS + DataLock policies** — full support for Grandfather-Father-Son extended retention with weekly/monthly/yearly tiers and WORM DataLock.
- **No Helios dependency** — every report tool works on a standalone on-prem cluster; synthesized Markdown reports are composed from cluster-local V1 + V2 endpoints.

---

## Installation

```bash
git clone https://github.com/dvermagithub/mcp-cohesity.git
cd mcp-cohesity
npm install
npm run build
```

## Configuration

The server is configured via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `COHESITY_CLUSTER` | Yes | — | Cohesity cluster hostname or IP |
| `COHESITY_USERNAME` | Yes | — | Username for authentication |
| `COHESITY_PASSWORD` | Yes | — | Password for authentication |
| `COHESITY_DOMAIN` | No | `LOCAL` | Authentication domain |
| `COHESITY_ALLOW_SELF_SIGNED` | No | `true` | Accept self-signed SSL certs |

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cohesity": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-cohesity/dist/index.js"],
      "env": {
        "COHESITY_CLUSTER": "your-cohesity-cluster.example.com",
        "COHESITY_USERNAME": "admin",
        "COHESITY_PASSWORD": "your-password",
        "COHESITY_DOMAIN": "LOCAL",
        "COHESITY_ALLOW_SELF_SIGNED": "true"
      }
    }
  }
}
```

## Usage with Claude Code

```bash
claude mcp add cohesity -- node /absolute/path/to/mcp-cohesity/dist/index.js
```

## Example Prompts

Day-1 setup:

- *"Register the vCenter at vcsa.prod.local with admin user administrator@vsphere.local"*
- *"Register our AWS commercial account using the IAM user with these credentials"*
- *"Join the cluster to our corp.example.com Active Directory"*
- *"Create a custom role called BackupOperator with PROTECTION_VIEW and PROTECTION_MODIFY privileges"*

Day-2 operations:

- *"Show me which protection groups failed their last backup"*
- *"Trigger an on-demand backup for the prod-vms group"*
- *"Browse the files in /home/zerto on deepak-vm's latest snapshot"*
- *"Recover /home/zerto/script.sh from yesterday's backup to its original location"*
- *"What are the critical alerts on the cluster right now?"*
- *"Cancel the recovery task that's been stuck for 30 minutes"*

Day-3 governance:

- *"Apply a 90-day Compliance DataLock to the most recent backup of the finance VMs"*
- *"Place a legal hold on every snapshot of the legal-review protection group"*
- *"Show me every Delete action in the audit log from the last 7 days"*
- *"Generate a Markdown capacity report for our weekly ops review"*
- *"Generate a failed-backups report for last night"*

## Development

```bash
npm run dev      # Run with tsx (auto-reloads)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled output
```

## QA Harness

A self-contained QA harness in [tests/qa-harness.mjs](tests/qa-harness.mjs) exercises every tool against a live cluster across three suites:

1. **CONNECTIVITY** — auth + cluster reachability
2. **DIRECT_API** — every backing HTTP endpoint, with safe probes for write operations
3. **MCP_TRANSPORT** — spawns the compiled server, verifies `tools/list`, and invokes a representative subset of read-only tools through the actual MCP protocol

Run it:

```bash
COHESITY_CLUSTER=192.0.2.10 \
COHESITY_USERNAME=admin \
COHESITY_PASSWORD=... \
node tests/qa-harness.mjs
```

The harness writes [tests/TEST_REPORT.md](tests/TEST_REPORT.md) and `tests/test-results.json` on every run.

## Architecture

```
src/
├── index.ts                    # MCP server bootstrap + STDIO transport
├── cohesity-client.ts          # HTTP client with V1/V2 auth, retry, auto-refresh
└── tools/
    ├── cluster.ts              # Cluster info (2 tools)
    ├── source-registration.ts  # Register/update/unregister sources (8 tools)
    ├── sources.ts              # Source listing, search, refresh (4 tools)
    ├── protection.ts           # Policies + groups CRUD + run/pause/resume (12 tools)
    ├── runs.ts                 # Backup run listing (2 tools)
    ├── run-actions.ts          # Cancel, DataLock, legal hold, retention (6 tools)
    ├── storage.ts              # Storage domains, objects, snapshots, file browse (4 tools)
    ├── recovery.ts             # Recovery task listing (2 tools)
    ├── restore.ts              # VM recovery, file search, file restore (4 tools)
    ├── alerts.ts               # Alert listing and resolution (2 tools)
    ├── notifications.ts        # Alert notification rules (4 tools)
    ├── external-targets.ts     # External archival targets (5 tools)
    ├── tiering.ts              # Data tiering tasks (6 tools)
    ├── reports.ts              # Heatmap + protection/recovery summaries (3 tools)
    ├── cluster-reports.ts      # Cluster-local + synthesized Markdown reports (6 tools)
    ├── stats.ts                # Storage, workload, replication stats (6 tools)
    ├── audit-logs.ts           # Audit log queries (3 tools)
    ├── users.ts                # User management (6 tools)
    ├── roles.ts                # Role management (4 tools)
    ├── active-directory.ts     # AD join/leave (3 tools)
    ├── antivirus.ts            # ICAP antivirus + infected files (7 tools)
    ├── kms.ts                  # KMS / encryption keys (6 tools)
    └── clones.ts               # View clones + clone tasks (3 tools)
```

## API Details

This server uses two Cohesity API versions:

- **V2 API** (`/v2/`) — Most operations: registration, protection groups, runs, sources, recoveries, policies, external targets, tiering, alerts, audit logs, users, roles, AD.
- **V1 API** (`/irisservices/api/v1/public/`) — Cluster-local reports (`protectedObjectsTrends`, `protectionSourcesJobsSummary`, `dataTransferToVaults`) and source hierarchy details. Used because some cluster-local reports are not exposed on V2.

Authentication uses `POST /v2/access-tokens` (Bearer token), with auto-refresh on 401 responses.

## Requirements

- Node.js 18+
- Cohesity DataProtect cluster with REST API access (tested with Cohesity 7.x)

## License

Source-Available Non-Commercial License. Free for personal, educational, and non-commercial use. Commercial use requires written permission from the author. See [LICENSE](LICENSE) for full terms.

Originally inspired by [Fredrik Karlsson's mcp-cohesity](https://github.com/fredriksknese/mcp-cohesity). Entirely rewritten by [Deepak Verma](https://github.com/dvermagithub).
