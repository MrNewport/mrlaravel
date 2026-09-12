# MrLaravel

A local source atlas for Laravel: map declared routes, controller actions, models, relationships and middleware; follow source links; compare snapshots; and explore a self-contained HTML report.

Package: `mrnewport/mrlaravel`. PHP 8.3+, Composer 2.2+, and Node.js 22+ are required. The pinned PHP parser ships with the package. **No npm install is needed to use it.** The standalone command does not require Laravel; Artisan integration is tested with Laravel 13.

## Install

Until the package is listed on Packagist, install the tagged GitHub release from your Laravel project:

```sh
composer config repositories.mrlaravel vcs https://github.com/MrNewport/mrlaravel
composer require --dev mrnewport/mrlaravel:^1.0
```

After Packagist submission, only the `composer require` command is needed. Composer 2.2+ creates a `vendor/bin/mrlaravel` proxy and Laravel discovers the service provider. No migrations, published config, routes or account credentials are required.

For a downloaded package ZIP, extract it outside your application, then add that extracted directory as a Composer path repository:

```sh
composer config repositories.mrlaravel path "/absolute/path/to/mrlaravel"
composer require --dev mrnewport/mrlaravel:^1.0
```

The website ZIP includes release-version metadata for this local installation. A Git clone instead gets its version from the `v1.0.0` tag. Keep the extracted folder if Composer symlinks it, or use a mirrored path repository (`options.symlink: false`).

## Scan your app

Run from the project where Composer installed the package:

```sh
vendor/bin/mrlaravel scan . --out ../mrlaravel-reports/first --name "My app"
```

This writes `atlas.json` and `report.html`. Open the HTML locally, review the analysis notes, and optionally import the JSON into your MrLaravel workspace. Nothing is uploaded automatically. Outputs must be outside the scanned project; quote paths containing spaces.

On Windows use `vendor\bin\mrlaravel.bat` and a path such as `C:\Projects\my-app`.

Laravel also exposes an Artisan command, defaulting to the current application:

```sh
php artisan mrlaravel:scan --out ../mrlaravel-reports/first --name "My app"
php artisan mrlaravel:scan /path/to/another-app --out ../mrlaravel-reports/another
```

**Artisan boots the application where the command is installed.** The standalone Composer binary loads Composer's autoloader, but does not invoke Laravel's bootstrap, Artisan, migrations or database commands. If the target has custom Composer autoload files or you want complete separation, install this package in a separate tools project and scan the target's absolute path. The JavaScript scanner itself never executes target PHP.

Check the runtime with `node --version`. If Node is not on PATH, either command accepts `--node="/absolute/path/to/node"`; `MRLARAVEL_NODE_BINARY` is also supported. A missing or older runtime produces an actionable error. Web report rendering does not need Node.

## Compare

Keep the first snapshot, scan again into a different directory, then:

```sh
vendor/bin/mrlaravel diff ../mrlaravel-reports/first/atlas.json ../mrlaravel-reports/after/atlas.json --out ../mrlaravel-reports/comparison.json
php artisan mrlaravel:diff ../mrlaravel-reports/first/atlas.json ../mrlaravel-reports/after/atlas.json
```

Without `--out`, diff prints JSON to stdout. Moving source lines alone does not count as a declaration change.

Exit codes: **0** completed (review diagnostics), **1** invalid input or I/O/runtime failure, **2** scan completed with PHP parse errors and a partial report. Unknown options and missing required arguments are errors.

## What gets analyzed

Regular PHP files under `app/` and `routes/`, plus `bootstrap/app.php`. Hidden, generated, dependency and sensitive paths are excluded; symbolic links are skipped. Results contain structural metadata and relative file/line/column references, not PHP bodies, environment files, logs or runtime records. Declared names and route metadata can still be private: review reports before sharing or importing them.

Supported declarations include explicit routes, conservative resource/API-resource expansion, controller methods, model ancestry and relationship calls, supported local traits, and statically declared bootstrap middleware. Provider-mounted routes, macros, dynamic code, unavailable/adapted traits and runtime behavior may remain partial or unresolved. A declaration count is not a verified runtime endpoint count. Read **Analysis boundaries** and **Needs review** in every report.

## PHP report rendering

```php
$html = (new \MrNewport\MrLaravel\ReportRenderer)->render($validatedAtlas);
```

Pass a validated version-1 snapshot. The renderer embeds JSON safely, produces a self-contained HTML report, and includes no server source root. This is the same renderer used by the MrLaravel website. Snapshot validation, accounts and storage belong to the host application.

## Development and checks

```sh
composer install
node --test tests/scanner.test.js
php tests/smoke.php
```

Node tests exercise source locations, graph integrity, privacy, parse failures, filesystem boundaries and comparisons. The PHP smoke test installs/runs the real commands against synthetic source, including failure cases and HTML rendering. GitHub Actions also checks Laravel package discovery. See [RELEASING.md](RELEASING.md) for parser updates, tags and Packagist submission.

## License

Proprietary; the existing project license is retained. Bundled `php-parser` 3.7.0 is BSD-3-Clause (see `engine/third-party/php-parser/LICENSE`). Doctrine Inflector 2.1 English rule data is MIT (see `licenses/doctrine-inflector.txt`).
