# Security review — 2026-10-13

Prepared by i729. This review records tested source changes; it is not a certification of the deployed service.

## Change

Require the timekeeperAdmin server claim for shared bot endpoints and shared attendance/master-data rules. User profiles remain owner-scoped, and attendance remains read-only to browsers. Retain the i729 signature without an embedded real name.

## Validation

10 bot tests passed; web production build passed; Firestore emulator anonymous/cross-account/admin checks passed.

## Dependency audit

Counts refer to package findings across the complete locked dependency tree, including tooling; they are not counts of distinct exploitable production vulnerabilities.

| Package project | Before | After | Remaining critical | Remaining high |
| --- | ---: | ---: | ---: | ---: |
| timekeeper | 7 | 4 | 0 | 4 |
| timekeeper/WhatsApp Bot | 17 | 8 | 0 | 0 |

## Required before rollout

Grant the timekeeperAdmin claim to approved operators with a trusted Admin SDK process before deploying the bot/rules. Authentication alone is not an administrator grant. No production Firebase changes were made.

## Scope

Source and locally fetched Git branches/tags/available pull-request heads were inspected. Private production settings, actual database policies, deployed binaries, backup stores, and third-party service permissions were not changed. Current-source cleanup does not remove data from Git history, existing forks, cached copies, or previously downloaded assets. Sensitive values are intentionally omitted.
