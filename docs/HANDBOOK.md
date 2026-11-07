# MrLaravel handbook

MrLaravel creates a local declaration atlas for Laravel source, produces a self-contained HTML report and compares structural snapshots. Its scanner parses PHP syntax without executing target PHP. Its separately reusable PHP `ReportRenderer` renders an existing atlas without Node.

This handbook documents the 1.0 package. The project remains **proprietary**. Public source availability does not change the license in [LICENSE](../LICENSE). Bundled parser and inflection data retain their respective third-party licenses.

## Runtime and installation

| Component | Requirement |
| --- | --- |
| PHP package and command wrapper | PHP 8.3+ |
| Composer installation | Composer runtime API 2.2+ |
| Scanner and comparison engine | Node.js 22+ |
| PHP-only report renderer | No Node process needed |
| Artisan discovery | Optional Illuminate integration; tested with Laravel 13 |

The pinned PHP parser ships with the package. Consumers do not need to run `npm install`.

```sh
composer config repositories.mrlaravel vcs https://github.com/MrNewport/mrlaravel
composer require --dev mrnewport/mrlaravel:^1.0
vendor/bin/mrlaravel --help
```

Use a VCS declaration when the release is not indexed in your package registry. Composer installs the executable proxy in `vendor/bin`.

For strongest separation from a target application's custom autoload code, install the tool in a separate Composer tools project:

```sh
mkdir architecture-tools
cd architecture-tools
composer config repositories.mrlaravel vcs https://github.com/MrNewport/mrlaravel
composer require mrnewport/mrlaravel:^1.0
vendor/bin/mrlaravel scan /absolute/path/to/target --out ../reports/target --name "Target app"
```

The standalone PHP wrapper loads its installed Composer autoloader. It does not call Laravel's bootstrap, migrations or database commands. A target application's custom Composer autoload files can execute if the tool was installed in that application; a separate tools project avoids loading that target autoloader. The JavaScript scanner itself never executes target PHP.

## Scan command

```sh
vendor/bin/mrlaravel scan /path/to/app --out /path/to/reports/before --name "Workshop app"
```

| Argument / option | Meaning |
| --- | --- |
| `scan` target | Required Laravel-like source directory |
| `--out` | Required output directory, outside the target |
| `--name` | Display label; defaults to `Application` |
| `--node` | Optional absolute Node executable for the PHP wrapper |
| `MRLARAVEL_NODE_BINARY` | Environment fallback before searching PATH |

Quote paths containing spaces. On Windows, use the generated `vendor\bin\mrlaravel.bat` proxy and normal Windows paths.

The engine writes `atlas.json` and `report.html`. It does not upload them or write into the scanned project. Output directories are created with a restrictive mode where supported; output files are written with mode 0600. Existing output paths must be regular non-symlink files.

Output admission resolves existing path ancestors before checking the target boundary, so an output path cannot bypass the rule through a directory symlink. This is a local developer tool, not an untrusted multi-user scanning service.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Completed; still inspect diagnostics |
| 1 | Invalid input, missing runtime, I/O failure or other command failure |
| 2 | Scan completed with PHP parse errors and a partial report |

A nonzero parse-error result can still have useful findings from other files. Do not treat a partial atlas as a complete runtime inventory.

## Artisan integration

```sh
php artisan mrlaravel:scan --out ../reports/current --name "Current application"
php artisan mrlaravel:scan /path/to/another-app --out ../reports/another
php artisan mrlaravel:diff ../reports/before/atlas.json ../reports/after/atlas.json
```

Artisan defaults the target to the application where the provider is installed. **Artisan boots that host application.** Use the standalone tool from a separate tools project when booting application providers is undesirable.

The provider adds commands only; it does not create routes, migrations, storage tables, sessions or accounts.

## Eligible files and privacy boundary

The scanner reads regular `.php` files under `app/` and `routes/`, plus `bootstrap/app.php`. It skips symlinks and excluded directory/file names, including hidden, generated, dependency, storage, credential, log, report, upload and backup paths. It does not crawl arbitrary application folders or vendor dependencies.

The default per-file scan budget is 2 MiB. Oversized or unreadable files are skipped with diagnostics. The JavaScript `scan()` API accepts a `maxFileBytes` option; the public CLI does not expose that option.

Reports contain structural identifiers and source positions, not PHP bodies, comments, arbitrary property/argument values, environment files or runtime records. Middleware parameters and sensitive-looking URI segments are redacted. Names, domains and route structure can still reveal private application design. Review reports before sharing them.

No target Composer scripts, application bootstrap, PHP files, migrations, database queries or network requests are executed by the JavaScript engine.

## What declarations are represented

| Area | Implemented analysis | Read the diagnostics when… |
| --- | --- | --- |
| Explicit routes | Static verbs, URI/name/domain metadata, nested groups, aliases, controller/invokable/closure handlers | Values or router calls are dynamic |
| HTTP semantics | GET/HEAD behavior, fallback and explicit verbs | Runtime registration could differ |
| Resource routes | Conservative `resource`/`apiResource` expansion, supported nested/shallow/parameter/filter options | Custom conventions suppress safe default inference |
| Controllers | Methods, action linkage and supported source references | A declared action is missing/unresolved |
| Models | Recognized Eloquent ancestry and structural metadata | Parent classes are external or ambiguous |
| Relationships | Direct relationship calls and supported static related-model resolution | Late-static/dynamic targets cannot be proven |
| Local traits | Supported lexical imports, consuming `self`, method precedence and source evidence | Conflicts, adaptations or external traits remain unresolved |
| Middleware | Supported static route and modern bootstrap declarations | Conditional/dynamic registration is encountered |
| Edges | Source-linked declaration/reference relationships | A static reference should not be interpreted as execution |

The atlas is not `artisan route:list`. Provider route mounting, runtime macros, implicit web/api groups, complete global/controller middleware execution order and arbitrary application configuration are not inferred. A route declaration count is not a verified count of reachable endpoints. Absence of a diagnostic is not proof that a dynamic application is fully understood.

## Atlas structure

The JSON has `schemaVersion: 1`, tool/parser metadata, application label, analysis mode and explicit boundaries. Its principal collections are:

- `files`: eligible file and parse status information.
- `routes`, `controllers`, `models`, `middleware`, `relationships`: declaration records.
- `edges`: links between known structural nodes.
- `diagnostics`: review items with code, severity and source evidence.
- `counts`: summary counts.

Source evidence uses a relative file path and one-based line/column. Record identifiers support graph linkage; do not use generated IDs as permanent domain identifiers across arbitrary source changes.

## Explore the HTML report

Open `report.html` locally. The report embeds its own presentation and atlas data. Local scan reports include a relative source base so source links can lead back to the inspected files. The user interface offers declaration exploration, search/filtering, graph relationships, source references and review notes.

Treat structural text as untrusted display data. The bundled renderers safely embed JSON and escape displayed markup. A host displaying reports should still use its intended origin, authorization, content-security and storage policy.

## Compare snapshots

```sh
vendor/bin/mrlaravel diff ../reports/before/atlas.json ../reports/after/atlas.json --out ../reports/comparison.json
```

Without `--out`, the command prints comparison JSON to stdout. It refuses an output that aliases either input, including an existing hard link.

The comparison contains `added`, `removed`, `changed` and counts. It compares declaration metadata while ignoring source-line relocation and generated identifiers. Route identity includes source file, methods, URI, name and domain; duplicate identities are paired in declaration order. Moving a route into a different file can therefore appear as removal/addition. Edge comparison normalizes referenced identities.

A nonempty comparison still exits 0 when the command completed. There is no `--check` difference exit-code option. A CI policy that fails on changes must inspect the comparison counts and distinguish approved architectural changes from unexpected ones.

Both inputs must be version-1 snapshots with the required collections. The CLI JSON decoder and comparison checks do not constitute a full untrusted-file admission service; bound and validate uploaded snapshots in the host before using them.

## PHP report rendering

```php
use MrNewport\MrLaravel\ReportRenderer;

$html = (new ReportRenderer)->render($validatedAtlas, mappingKey: 'review-2026-11');
```

`render(array $atlas, string $mappingKey = 'offline', array $options = []): string` uses the bundled report assets and safely embedded JSON. It deliberately sets the source base to null, so a server-rendered report does not expose a server filesystem root. The mapping key is presentation data, not an authorization capability.

The caller must validate snapshot version, structure, string sizes, collection sizes and ownership before rendering untrusted input. The renderer is not a scanner or validator. It performs no database/network operation and needs no Node executable.

A production report viewer can install this package for the renderer alone. A local developer workflow can keep the scanner as a development dependency. Installing the dependency without an exercised renderer or scanner call is not an application integration.

## PHP process wrapper

```php
use MrNewport\MrLaravel\Scanner;
use Symfony\Component\Console\Output\BufferedOutput;

$output = new BufferedOutput;
$code = (new Scanner)->run(
    ['scan', $trustedSourceDirectory, '--out', $trustedReportDirectory, '--name', 'Review'],
    $output,
    $trustedNodeExecutable,
);
```

The wrapper checks Node's major version, then invokes the fixed engine executable through Symfony Process with an argument array. Node's version probe has a 10-second timeout. The scan process itself has no package timeout. A hosted scanning worker must add its own CPU/memory/time limits, trusted roots, input ownership and process policy. Do not expose arbitrary source directories or scanner arguments as a public web form.

## Recipes

**Review a refactor:** scan a fixed commit, keep its snapshot, scan the refactor into a different directory and inspect the structural diff plus diagnostics. Verify runtime behavior with the application's own tests.

**Share a report:** review structural metadata for confidentiality, copy the self-contained report to an authorized destination and preserve the snapshot's provenance. No automatic publishing or upload occurs.

**Build a documentation viewer:** scan known source during an offline build, validate/bound the generated atlas and render it through `ReportRenderer`. Keep user accounts, upload validation, storage and access policy in the host.

## Development checks and licensing

```sh
composer install
node --test tests/*.test.js
php tests/smoke.php
php tests/report-sources.php
```

The Node tests exercise source columns, graph integrity, privacy, parse failures, route/resource semantics, traits, bootstrap middleware, deterministic snapshots, comparison and filesystem boundaries. PHP smoke tests run real commands against synthetic source and verify PHP rendering. CI additionally verifies Laravel discovery. See [RELEASING.md](../RELEASING.md) for parser updates and release packaging.

The existing proprietary project license remains unchanged. Bundled `php-parser` 3.7.0 is BSD-3-Clause; Doctrine Inflector 2.1 English rule data is MIT. See their notices in `engine/third-party/php-parser/LICENSE` and `licenses/doctrine-inflector.txt`.

See the [feature inventory](FEATURES.md), [scanner source](../engine/src/scanner.js) and [report renderer](../src/ReportRenderer.php).

## Explicit included-source reports (1.1)

The PHP renderer can optionally embed an approved source bundle. This is useful for fictional documentation fixtures or an authorized offline review where readers do not have a local checkout:

```php
use MrNewport\MrLaravel\ReportRenderer;

// $validatedAtlas and these texts come from the same reviewed source revision.
$sources = [
    'app/Models/Proposal.php' => $approvedProposalSource,
    'routes/web.php' => $approvedRouteSource,
];
$html = (new ReportRenderer)->render(
    $validatedAtlas,
    mappingKey: 'fictional-procurement',
    options: ['sources' => $sources],
);
```

The full signature is `render(array $atlas, string $mappingKey = 'offline', array $options = []): string`. Existing one- and two-argument calls retain metadata-only rendering and local folder mapping. `sources` is the only supported option. It is a map of canonical relative filenames to UTF-8 **text already supplied by the caller**. The renderer never opens those filenames, walks a source directory, scans the content, executes the PHP or fetches missing files. Its ordinary bundled HTML/CSS/JavaScript assets are still read from the installed package.

Every provided filename must occur exactly in `atlas.files[*].file`. A subset is allowed; membership establishes a declared filename, not proof that its content matches the snapshot. The host must retain provenance and approve source/snapshot alignment. A requested line outside the supplied file produces an explicit mismatch message. The adapter does not invent missing source, run a fresh scan or infer another file from the server.

| Admission bound | Limit / public constant |
| --- | --- |
| Files | 100, `ReportRenderer::MAX_SOURCE_FILES` |
| Per-file UTF-8 bytes | 262,144, `MAX_SOURCE_FILE_BYTES` |
| Total source-text bytes | 2,097,152, `MAX_SOURCE_BYTES` |
| Lines per file | 10,000, `MAX_SOURCE_LINES`; trailing newline creates a final empty line |
| Relative filename bytes | 512, `MAX_SOURCE_PATH_BYTES` |

Absolute paths, drive/URL syntax, backslashes, NUL/control characters, empty/dot/parent path segments, percent-encoded segments and query/fragment characters are rejected. Values must be strings with valid UTF-8 and no NUL. Unknown options, undeclared filenames and budget overflow throw `InvalidArgumentException` before HTML is produced. No validation rule permits a supplied path to become a filesystem read. An explicit empty map is valid and shows an empty file browser. The adapter validates this bundle contract; validating the atlas's overall schema, resource budget, ownership and permitted disclosure remains the host's responsibility.

A bundled report adds **Browse included source**, an explicit source-inclusion notice and a named native dialog. A declaration's source control opens the supplied file at its one-based line and shows its column reference. Readers can select another included file, go to a line and copy the supplied text. Code is inserted through `textContent`; HTML-looking text, PHP, template marker strings and literal object keys remain data. A missing file is reported as omitted. The existing local mapping remains available as an optional fallback for omitted files; included files keep using the embedded viewer.

The dialog supports keyboard file selection, line entry, native Escape/close behavior, a focusable code region and focus restoration to its opener. Global search shortcuts do not move focus out of an open dialog. Analysis-boundary and folder dialogs are also named, and the report provides a main-landmark skip link. The analysis boundaries button remains available on narrow screens. The local-folder dialog focuses its input when opened, associates rejected-path errors with that input, returns focus there after a rejected mapping, and restores the opener on close (or the folder toolbar button if that finding was replaced). Browser clipboard permissions can refuse copying; the viewer then explains how to select the text manually instead of claiming a copy succeeded.

**Sharing changes with this explicit option:** anyone who receives the HTML can read the included source bodies. They are not redacted by the scanner's metadata privacy filters. Pass only source that the host is authorized to disclose; the public workshop passes committed fictional fixtures. No code is included by default, and scanning/CLI report generation still does not automatically collect or embed source bodies. Export JSON continues to export atlas metadata, not the separate source bundle.

In a bundled report, the analysis-boundaries dialog explicitly separates the scanner JSON's source-omission rules from the HTML's included source files and repeats the sharing warning. This presentation context does not alter the atlas or its JSON export.

When embedding the interactive report in a sandboxed iframe, allow scripts and forms (`sandbox="allow-scripts allow-forms"`) for its local line-navigation form. Keep the report's `form-action 'none'` CSP: the form is handled locally and must not submit to a network destination. No same-origin permission is required. Browsers may restrict clipboard or download actions independently; the viewer reports copy failure explicitly, and the host should verify its intended download transport.

The report remains self-contained with network connections disabled by its CSP. Included file browsing performs no additional network or filesystem operation. `tests/report-sources.php` exercises filename/type/budget boundaries, literal embedding, marker collisions and default API compatibility; `tests/source-viewer.test.js` checks source navigation, text-only rendering, focus, absent data and copy failures. These unit checks complement a host's actual browser, screen-reader and accessibility verification.
