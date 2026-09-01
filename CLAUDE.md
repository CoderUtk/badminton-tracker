@AGENTS.md

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Compact Instructions

On `/compact`, keep:
- Current branch/commit.
- Which supabase migrations are APPLIED TO PRODUCTION vs local-only. As of 2026-09-01: all migrations through `0044_guest_matches_purge.sql` are applied to prod (`pg_cron` enabled in `pg_catalog`; `0044` = daily `purge-guest-matches` job 03:17 UTC). Web guest-match storage E2E + live two-anon-user RLS check both passed against prod. Remaining for that feature: PWA packaging (manifest/SW/icons/iOS install) + web orientation-lock check — separate spec, unstarted.
- Any open plan file under `docs/superpowers/plans/`.
- Shared-checkout commit rule: explicit pathspec always, never `git add -A` / `git add .` / `git commit -a`.
- Any file with uncommitted changes owned by another concurrent session (do not touch these).

Drop: file contents already read, subagent transcripts, resolved build errors.
