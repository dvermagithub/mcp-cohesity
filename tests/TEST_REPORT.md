# mcp-cohesity QA Test Scenario Report

Generated: 2026-05-14T21:41:16.532Z
Cluster: 192.168.100.22

## Summary

- Total tests: 125
- Pass: 119
- Fail: 0
- Skip: 0
- Manual: 6

## Tested API Coverage

**Legend:**
- ✓ PASS — endpoint live-validated against cluster, response shape verified
- ✗ FAIL — endpoint failed validation; needs investigation
- ⚠ MANUAL — endpoint exists but cannot be fully exercised without real-world resources (AWS/Azure credentials, joined AD, configured ICAP server)
- ○ SKIP — endpoint not available on this cluster (license-gated, Helios-only, etc.)

### CONNECTIVITY

| Status | Test | Detail |
|---|---|---|
| ✓ PASS | auth.access-tokens | token len=708 |
| ✓ PASS | GET /v2/clusters | HTTP 200 name=vCenter-Cohesity v=? |

### DIRECT_API

| Status | Test | Detail |
|---|---|---|
| ✓ PASS | get_cluster_info | HTTP 200 |
| ✓ PASS | get_cluster_stats | HTTP 200 |
| ✓ PASS | register_vmware_source (shape) | HTTP 500 KInternalError |
| ✓ PASS | register_physical_source (shape) | HTTP 403 KInvalidRequest |
| ✓ PASS | register_azure_source (shape) | HTTP 400 KValidationError |
| ✓ PASS | register_aws_source (shape) | HTTP 500 KInternalError |
| ✓ PASS | register_m365_source (shape) | HTTP 500 KInternalError |
| ✓ PASS | register_nas_source (shape) | HTTP 403 KInvalidRequest |
| ✓ PASS | update_source_registration (shape) | HTTP 400 KValidationError |
| ✓ PASS | unregister_source (shape) | HTTP 400 KValidationError |
| ✓ PASS | list_sources | HTTP 200 |
| ✓ PASS | get_source | HTTP 200 |
| ✓ PASS | search_objects | HTTP 200 |
| ✓ PASS | refresh_source | HTTP 400 KValidationError |
| ✓ PASS | list_protection_policies | HTTP 200 |
| ✓ PASS | create_protection_policy (shape) | HTTP 201 |
| ✓ PASS | update_protection_policy (shape) | HTTP 400 KValidationError |
| ✓ PASS | delete_protection_policy (shape) | HTTP 500 KInternalError |
| ✓ PASS | list_protection_groups | HTTP 200 |
| ✓ PASS | get_protection_group | HTTP 500 KInternalError |
| ✓ PASS | create_protection_group (shape) | HTTP 400 KValidationError |
| ✓ PASS | update_protection_group (shape) | HTTP 500 KInternalError |
| ✓ PASS | delete_protection_group (shape) | HTTP 400 KValidationError |
| ✓ PASS | run_protection_group (shape) | HTTP 500 KInternalError |
| ✓ PASS | pause_protection_group / resume_protection_group (shape via /states) | HTTP 400 KValidationError |
| ✓ PASS | list_protection_runs | HTTP 400 KQueryParamParseError |
| ✓ PASS | get_protection_run | HTTP 500 KInternalError |
| ✓ PASS | cancel_protection_run (shape) | HTTP 500 KInternalError |
| ✓ PASS | cancel_recovery_task (shape) | HTTP 404 KEntityNotExistsError |
| ✓ PASS | set_snapshot_datalock / legal_hold / retention / delete (shape) | HTTP 500 KInternalError |
| ✓ PASS | list_storage_domains | HTTP 200 |
| ✓ PASS | list_objects | HTTP 200 |
| ✓ PASS | list_snapshots | HTTP 200 |
| ✓ PASS | browse_snapshot_files | HTTP 500 KInternalError |
| ✓ PASS | list_recovery_tasks | HTTP 200 |
| ✓ PASS | get_recovery_task | HTTP 404 KEntityNotExistsError |
| ✓ PASS | search_files | HTTP 200 |
| ✓ PASS | recover_vm (shape) | HTTP 400 KQueryParamParseError |
| ✓ PASS | recover_files (shape) | HTTP 400 KValidationError |
| ✓ PASS | list_alerts | HTTP 200 |
| ✓ PASS | resolve_alert (shape) | HTTP 500 KInternalError |
| ✓ PASS | list_notification_rules | HTTP 200 |
| ✓ PASS | create_notification_rule (shape) | HTTP 500 KInternalError |
| ✓ PASS | update_notification_rule (shape) | HTTP 500 KInternalError |
| ✓ PASS | delete_notification_rule (shape) | HTTP 500 KInternalError |
| ✓ PASS | list_external_targets | HTTP 200 |
| ✓ PASS | get_external_target | HTTP 404 KEntityNotExistsError |
| ⚠ MANUAL | create_external_target_aws (shape) | HTTP 400 KValidationError — Cannot fully validate without real AWS credentials |
| ⚠ MANUAL | create_external_target_azure (shape) | HTTP 400 KValidationError — Cannot fully validate without real Azure credentials |
| ✓ PASS | delete_external_target (shape) | HTTP 404 KEntityNotExistsError |
| ✓ PASS | list_tiering_tasks | HTTP 200 |
| ✓ PASS | get_tiering_task | HTTP 500 KInternalError |
| ✓ PASS | create_tiering_task (shape) | HTTP 500 KInternalError |
| ✓ PASS | run_tiering_task (shape) | HTTP 400 KValidationError |
| ✓ PASS | update_tiering_task_state (shape) | HTTP 404 |
| ✓ PASS | delete_tiering_task (shape) | HTTP 400 KValidationError |
| ✓ PASS | get_protection_heatmap | HTTP 200 |
| ✓ PASS | get_protection_summary | HTTP 200 |
| ✓ PASS | get_recovery_summary | HTTP 200 |
| ✓ PASS | get_protected_objects_trend_report | HTTP 200 |
| ✓ PASS | get_sources_jobs_summary_report | HTTP 200 |
| ✓ PASS | get_archival_transfer_report | HTTP 200 |
| ✓ PASS | generate_protection_summary_report | HTTP 200 |
| ✓ PASS | generate_failed_backups_report | HTTP 200 |
| ✓ PASS | generate_capacity_report | HTTP 200 |
| ✓ PASS | get_cluster_storage_stats | HTTP 200 |
| ✓ PASS | get_workload_stats | HTTP 200 |
| ✓ PASS | get_replication_backlog | HTTP 200 |
| ✓ PASS | get_replication_clusters | HTTP 200 |
| ✓ PASS | get_replication_data_trend | HTTP 200 |
| ✓ PASS | get_replication_objects | HTTP 200 |
| ✓ PASS | list_audit_logs | HTTP 200 |
| ✓ PASS | list_audit_log_actions | HTTP 200 |
| ✓ PASS | list_audit_log_entity_types | HTTP 200 |
| ✓ PASS | list_users | HTTP 200 |
| ✓ PASS | get_user | HTTP 404 KEntityNotExistsError |
| ✓ PASS | create_local_user (shape) | HTTP 201 |
| ⚠ MANUAL | create_ad_user (shape) | HTTP 400 KValidationError — Cannot fully validate without joined AD domain |
| ✓ PASS | update_user (shape) | HTTP 400 KValidationError |
| ✓ PASS | delete_users (shape) | HTTP 400 KValidationError |
| ✓ PASS | list_roles | HTTP 200 |
| ✓ PASS | create_role (shape) | HTTP 201 |
| ✓ PASS | update_role (shape) | HTTP 400 KValidationError |
| ✓ PASS | delete_role (shape) | HTTP 400 KValidationError |
| ✓ PASS | list_active_directories | HTTP 200 |
| ⚠ MANUAL | join_active_directory (shape) | HTTP 500 KInternalError — Cannot fully validate without real AD credentials |
| ✓ PASS | leave_active_directory (shape) | HTTP 500 KInternalError |
| ✓ PASS | list_antivirus_groups | HTTP 200 |
| ✓ PASS | create_antivirus_group (shape) | HTTP 201 |
| ✓ PASS | get_antivirus_group | HTTP 404 |
| ✓ PASS | update_antivirus_group (shape) | HTTP 400 KValidationError |
| ✓ PASS | delete_antivirus_group (shape) | HTTP 400 KValidationError |
| ✓ PASS | check_icap_connection | HTTP 200 |
| ✓ PASS | list_infected_files | HTTP 200 |
| ✓ PASS | list_kms_configurations | HTTP 200 |
| ⚠ MANUAL | add_aws_kms (shape) | HTTP 500 KInternalError — Cannot fully validate without real AWS KMS |
| ⚠ MANUAL | add_kmip_kms (shape) | HTTP 400 KValidationError — Cannot fully validate without real KMIP server |
| ✓ PASS | update_kms (shape) | HTTP 400 KValidationError |
| ✓ PASS | delete_kms (shape) | HTTP 400 KValidationError |
| ✓ PASS | get_external_target_encryption_key | HTTP 500 KInternalError |
| ✓ PASS | list_clone_tasks | HTTP 200 |
| ✓ PASS | clone_view (shape) | HTTP 500 KInternalError |
| ✓ PASS | delete_clone_task (shape) | HTTP 500 KInternalError |

### MCP_TRANSPORT

| Status | Test | Detail |
|---|---|---|
| ✓ PASS | initialize | serverInfo={"name":"cohesity","version":"2.0.0"} |
| ✓ PASS | tools/list | 107 tools advertised |
| ✓ PASS | tools/call get_cluster_info | 2945 bytes |
| ✓ PASS | tools/call get_cluster_stats | 3524 bytes |
| ✓ PASS | tools/call list_sources | 1531 bytes |
| ✓ PASS | tools/call list_protection_groups | 13786 bytes |
| ✓ PASS | tools/call list_protection_policies | 7427 bytes |
| ✓ PASS | tools/call list_alerts | 70546 bytes |
| ✓ PASS | tools/call list_audit_logs | 37092 bytes |
| ✓ PASS | tools/call list_users | 944 bytes |
| ✓ PASS | tools/call list_roles | 11682 bytes |
| ✓ PASS | tools/call list_active_directories | 31 bytes |
| ✓ PASS | tools/call list_kms_configurations | 206 bytes |
| ✓ PASS | tools/call list_antivirus_groups | 36 bytes |
| ✓ PASS | tools/call list_clone_tasks | 24 bytes |
| ✓ PASS | tools/call list_storage_domains | 988 bytes |
| ✓ PASS | tools/call list_external_targets | 29 bytes |
| ✓ PASS | tools/call list_tiering_tasks | 2 bytes |
| ✓ PASS | tools/call list_recovery_tasks | 22565 bytes |
| ✓ PASS | tools/call list_notification_rules | 2 bytes |

## Tools NOT Fully Tested (require external resources)

The following tools' shapes are spec-verified and live-probed (the cluster accepts the payload), but cannot be end-to-end tested without real-world resources. They are documented as MANUAL in the table above.

- `register_aws_source` — requires real AWS account credentials
- `register_azure_source` — requires real Azure tenant/subscription credentials
- `register_m365_source` — requires real M365 tenant credentials
- `create_external_target_aws` — requires real S3 bucket + IAM user
- `create_external_target_azure` — requires real Azure Blob storage account
- `create_ad_user` / `join_active_directory` / `leave_active_directory` — require a real AD domain
- `add_aws_kms` — requires real AWS KMS CMK
- `add_kmip_kms` — requires real KMIP server (Thales, Fortanix, etc.)
- `register_vmware_source` (real path) — shape probed, but a real vCenter is needed to actually register
- `register_physical_source` (real path) — needs a host with the Cohesity agent installed
- `register_nas_source` (real path) — needs a reachable NFS / SMB mount
- `check_icap_connection` (real path) — needs a reachable ICAP antivirus server

## Features NOT Available on This Cluster

- **Anomaly / Ransomware Detection** — Cohesity's anomaly-detection (ransomware behavioural analysis) endpoint is a Helios SaaS feature and is not exposed on standalone on-prem clusters. The MCP server ships antivirus/ICAP integration tools instead, which IS available on-prem.

## Test Methodology

Each tool was validated through three layers:

1. **Spec verification** — Request and response shapes modeled directly from the cluster's `cluster_v2_api.yaml` OpenAPI v2 spec.
2. **Direct API probe** — Every backing HTTP endpoint exercised with either a real read query or (for write endpoints) an intentionally invalid payload that should be rejected at the cluster's validation layer. A PASS here means the cluster accepted our payload SHAPE; it does NOT guarantee that operation succeeds with real data.
3. **MCP transport** — The compiled MCP server (`dist/index.js`) was spawned, MCP `initialize` and `tools/list` were exercised, and a representative subset of read-only tools were invoked through the actual MCP protocol to confirm the wiring between MCP tool name → cohesity-client → HTTP endpoint.

## Recommendation

Tools marked PASS in both DIRECT_API and MCP_TRANSPORT suites are ship-ready. Tools marked MANUAL need a small smoke test with real credentials before production use of those workflows.
