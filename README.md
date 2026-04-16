# mcp-cohesity

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for **Cohesity DataProtect**, providing AI assistants with full access to backup management, recovery operations, data protection monitoring, and infrastructure management through the Cohesity REST API.

> Inspired by [fredriksknese/mcp-cohesity](https://github.com/fredriksknese/mcp-cohesity). Entirely rewritten from scratch with 56 tools across 12 categories.

## Features

**56 tools** across twelve categories:

### Cluster (3 tools)

| Tool | Description |
|------|-------------|
| `get_cluster_info` | Get cluster name, ID, software version, and node count |
| `get_cluster_stats` | Get storage capacity (used/total) and throughput statistics |
| `get_cluster_storage_stats` | Get detailed storage breakdown including data reduction ratios and capacity planning metrics |

### Protection Policies (4 tools)

| Tool | Description |
|------|-------------|
| `list_protection_policies` | List all data protection policies with schedule and retention settings |
| `create_protection_policy` | Create a new policy with incremental/full schedules, GFS retention, and DataLock (WORM) support |
| `update_protection_policy` | Update an existing protection policy |
| `delete_protection_policy` | Delete a protection policy |

### Protection Groups (8 tools)

| Tool | Description |
|------|-------------|
| `list_protection_groups` | List protection groups (backup jobs) with status and schedule |
| `get_protection_group` | Get detailed configuration of a specific protection group |
| `create_protection_group` | Create a new protection group for VMware, Physical, SQL, etc. |
| `update_protection_group` | Update a protection group (add/remove VMs, change policy, enable indexing) |
| `delete_protection_group` | Delete a protection group and optionally its snapshots |
| `run_protection_group` | Trigger an on-demand backup run |
| `pause_protection_group` | Pause scheduled backups for a protection group |
| `resume_protection_group` | Resume a paused protection group |

### Backup Runs (3 tools)

| Tool | Description |
|------|-------------|
| `list_protection_runs` | List recent backup runs with status, duration, and data size |
| `get_protection_run` | Get detailed information about a specific backup run |
| `cancel_protection_run` | Cancel a running backup |

### Protection Sources (4 tools)

| Tool | Description |
|------|-------------|
| `list_sources` | List all registered sources (vSphere, Physical, NAS, SQL, etc.) |
| `get_source` | Get full object hierarchy details for a specific source |
| `search_objects` | Search for protectable objects (VMs, databases) across all sources |
| `refresh_source` | Refresh a registered source to sync latest inventory (e.g. re-discover VMs from vCenter) |

### Storage & Objects (4 tools)

| Tool | Description |
|------|-------------|
| `list_storage_domains` | List storage domains (view boxes) where backups are stored |
| `list_objects` | List protectable objects under a registered source |
| `list_snapshots` | List available backup snapshots for a specific object |
| `browse_snapshot_files` | Browse files and folders inside a VM snapshot using indexed search |

### Recovery & File Restore (5 tools)

| Tool | Description |
|------|-------------|
| `list_recovery_tasks` | List recovery tasks with status and type |
| `get_recovery_task` | Get detailed information about a specific recovery task |
| `recover_vm` | Recover a VM from a snapshot (instant recovery or full clone) |
| `search_files` | Search for files across all indexed backups by name pattern |
| `recover_files` | Recover specific files from a snapshot to original or alternate location |

### Alerts (2 tools)

| Tool | Description |
|------|-------------|
| `list_alerts` | List cluster alerts filtered by severity, category, and state |
| `resolve_alert` | Mark an alert as resolved with resolution notes |

### Alert Notifications (4 tools)

| Tool | Description |
|------|-------------|
| `list_notification_rules` | List all alert notification rules |
| `create_notification_rule` | Create a rule to send email, webhook, SNMP, or syslog alerts on specific categories/severities |
| `update_notification_rule` | Update an existing notification rule |
| `delete_notification_rule` | Delete a notification rule |

### External Targets (5 tools)

| Tool | Description |
|------|-------------|
| `list_external_targets` | List registered external targets (AWS S3, Azure Blob, NAS, tape) for archival/tiering |
| `get_external_target` | Get details of a specific external target |
| `create_external_target_aws` | Register a new AWS S3 external target |
| `create_external_target_azure` | Register a new Azure Blob Storage external target |
| `delete_external_target` | Delete an external target |

### Data Tiering (6 tools)

| Tool | Description |
|------|-------------|
| `list_tiering_tasks` | List all data tiering tasks |
| `get_tiering_task` | Get details of a specific tiering task |
| `create_tiering_task` | Create a task to automatically move cold data to an external target |
| `run_tiering_task` | Trigger an on-demand tiering run |
| `update_tiering_task_state` | Pause or resume tiering tasks |
| `delete_tiering_task` | Delete a tiering task |

### Reports & Stats (6 tools)

| Tool | Description |
|------|-------------|
| `get_protection_heatmap` | Get a per-VM per-day protection status grid (matches the Cohesity GUI heatmap) |
| `get_protection_summary` | Get overall protection run statistics and success/failure counts |
| `get_recovery_summary` | Get recovery task statistics for a time range |
| `get_workload_stats` | Get data volumes and counts per workload type (VMware, Physical, NAS, SQL, etc.) |
| `get_replication_backlog` | Get replication backlog stats showing pending data to remote clusters |
| `get_replication_clusters` | List remote replication partner clusters with total data replicated |

### Replication Trends (2 tools)

| Tool | Description |
|------|-------------|
| `get_replication_data_trend` | Get time-series replication throughput data for capacity planning |
| `get_replication_objects` | List all objects replicated to/from remote clusters in a time range |

## Key Enhancements Over Upstream

- **Auto source refresh** — CRUD operations (create/update/delete groups, search objects) automatically refresh all registered sources before executing, ensuring the latest inventory from vCenter/Hyper-V
- **LVM volume path handling** — File restore to original paths on LVM-based Linux VMs works correctly by automatically using the `alternatePath` workaround for Cohesity's volume prefix (`lvol_N/`) limitation
- **GFS + DataLock policy creation** — Full support for Grandfather-Father-Son extended retention with weekly/monthly/yearly tiers and WORM DataLock protection
- **Indexed file browsing** — `browse_snapshot_files` uses the V2 search API with smart path-based search term derivation (requires indexing enabled on the protection group)

## Installation

```bash
git clone https://github.com/dvermagithub/CohesityMCP.git
cd CohesityMCP
npm install
npm run build
```

## Configuration

The server is configured via environment variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COHESITY_CLUSTER` | Yes | -- | Cohesity cluster hostname or IP address |
| `COHESITY_USERNAME` | Yes | -- | Username for authentication |
| `COHESITY_PASSWORD` | Yes | -- | Password for authentication |
| `COHESITY_DOMAIN` | No | `LOCAL` | Authentication domain |
| `COHESITY_ALLOW_SELF_SIGNED` | No | `true` | Accept self-signed SSL certificates |

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cohesity": {
      "command": "node",
      "args": ["/absolute/path/to/CohesityMCP/dist/index.js"],
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
claude mcp add cohesity -- node /absolute/path/to/CohesityMCP/dist/index.js
```

Set the required environment variables before running, or configure them in your MCP settings.

## Example Prompts

Once connected, you can ask your AI assistant things like:

- *"Show me the current cluster storage utilization and capacity"*
- *"List all protection groups that failed their last backup"*
- *"Trigger an on-demand backup for the VM production group"*
- *"What are the critical alerts on the cluster right now?"*
- *"Create a protection policy with daily incremental, weekly full, and 30-day retention"*
- *"Add deepak-vm8 to the existing protection group"*
- *"Browse the files in /home/zerto on deepak-vm's latest snapshot"*
- *"Recover the file /home/zerto/script.sh from yesterday's backup to its original location"*
- *"Show me the protection heatmap for the last 7 days"*
- *"Create a notification rule to email admin@company.com on all critical backup failures"*
- *"List all external archival targets and their storage classes"*
- *"What's the replication backlog to our DR cluster?"*
- *"Pause the nightly backup group during the maintenance window"*
- *"Refresh the vCenter source to pick up newly created VMs"*

## Development

```bash
npm run dev      # Run with tsx (auto-reloads)
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled output
```

## Architecture

```
src/
├── index.ts                # Entry point — creates MCP server + STDIO transport
├── cohesity-client.ts      # HTTP client with token-based auth, V1/V2 API, auto-refresh
└── tools/
    ├── cluster.ts          # Cluster info and stats (2 tools)
    ├── protection.ts       # Protection policies, groups, pause/resume, run (12 tools)
    ├── runs.ts             # Backup run management (2 tools)
    ├── sources.ts          # Protection source management + search + refresh (4 tools)
    ├── storage.ts          # Storage domains, objects, snapshots, file browse (4 tools)
    ├── recovery.ts         # Recovery task management (2 tools)
    ├── restore.ts          # VM recovery, file search, file restore (5 tools)
    ├── alerts.ts           # Alert management (2 tools)
    ├── notifications.ts    # Alert notification rules CRUD (4 tools)
    ├── reports.ts          # Protection heatmap, summaries (3 tools)
    ├── stats.ts            # Cluster storage, workload, replication stats (6 tools)
    ├── external-targets.ts # External archival targets CRUD (5 tools)
    └── tiering.ts          # Data tiering task management (6 tools)
```

## API Details

This server uses two Cohesity API versions:

- **V2 API** (`/v2/`) — Used for most operations: protection groups, runs, sources, recoveries, policies, external targets, tiering, alerts, and stats
- **V1 API** (`/irisservices/api/v1/public/`) — Used for alert listing and source hierarchy details

Authentication uses the V2 access-tokens endpoint (`POST /v2/access-tokens`) with Bearer token auth. Tokens are automatically refreshed on 401 responses.

## Requirements

- Node.js 18+
- Cohesity DataProtect cluster with REST API access (tested with Cohesity 7.x)

## License

Source-Available Non-Commercial License. Free for personal, educational, and non-commercial use. Commercial use requires written permission from the author. See [LICENSE](LICENSE) for full terms.

Originally inspired by [Fredrik Karlsson's mcp-cohesity](https://github.com/fredriksknese/mcp-cohesity). Entirely rewritten by [Deepak Verma](https://github.com/dvermagithub).
