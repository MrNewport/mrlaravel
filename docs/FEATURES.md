# MrLaravel feature inventory

MrLaravel retains its proprietary project license. This is an inventory of implemented source-analysis and report behavior, not a runtime coverage guarantee.

| Capability | Source / entry point | Boundary |
| --- | --- | --- |
| Standalone Composer CLI | `bin/mrlaravel`, `src/Console/*` | PHP8.3+/Node22+; Composer autoloader still loads |
| Optional Artisan commands | `MrLaravelServiceProvider` | Artisan boots its host application |
| Static PHP parsing | `engine/src/scanner.js`, bundled parser | No target PHP execution |
| Restricted source walk | `sourceFiles()` | `app`, `routes`, explicit bootstrap file; no vendor crawl |
| Size/read/parse diagnostics | `scan()` | Partial output is possible and explicitly labeled |
| Explicit route/group linkage | `routes.js` | Dynamic/provider mounting remains incomplete |
| Conservative resource expansion | `resources.js` | Custom conventions can suppress inference |
| Controller and model declarations | `scanner.js` | Static references are not runtime traces |
| Eloquent relationship declarations | `scanner.js` | Unresolved/dynamic targets remain review items |
| Local trait composition | `traits.js` | External/conflicting/adapted traits need review |
| Static bootstrap middleware | `bootstrap-middleware.js` | No complete runtime middleware-order claim |
| Source-linked graph | `edges` and source references | Relative file/line/column evidence |
| Structural privacy filters | Scanner and tests | Metadata can still be confidential |
| Deterministic version-1 atlas | `atlas.json` | Generated IDs are not permanent domain IDs |
| Self-contained offline report | Engine report renderer | No automatic upload |
| Safe PHP report renderer | `ReportRenderer::render()` | Caller validates atlas; no Node required |
| Structural snapshot comparison | `diff.js`, CLI `diff` | Ignores line movement; differences do not change successful exit code |
| Protected output paths | Engine CLI | No output into scanned target or aliased diff inputs |
| Explicit exit statuses | 0 completed,1 failure,2 partial parse failure | Diagnostics must still be reviewed |

No account system, hosted upload service, database, migrations or public routes are included. The [handbook](HANDBOOK.md) covers isolation, comparison semantics, PHP APIs and application recipes.
