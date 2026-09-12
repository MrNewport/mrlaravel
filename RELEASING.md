# Release maintenance

This directory is the complete `mrnewport/mrlaravel` GitHub repository. Composer reads versions from Git tags; do not add a version field to the repository's composer.json.

1. Update code and tests. Keep the CLI application version and snapshot tool version aligned for a release. Review bundled third-party licenses when updating dependencies.
2. Run `composer validate --strict`, `composer install`, `node --test tests/scanner.test.js`, and `php tests/smoke.php`. Verify the Laravel integration job too.
3. Commit the tested tree, tag it (for example `v1.0.0`), and push the commit and tag. GitHub's source ZIP is installable by Composer without npm or build scripts.
4. Submit `https://github.com/MrNewport/mrlaravel` at https://packagist.org/packages/submit while signed into the account that owns the `mrnewport` vendor. Packagist reads composer.json and release tags; you do not upload a ZIP to Packagist.
5. Enable the Packagist GitHub integration/webhook so future tagged releases update automatically. Confirm the new version on Packagist before changing user instructions to a Packagist-only install.

The website maintains this package in `packages/mrlaravel` and uses it through Composer. Update that source and the package repository together. Its `npm run build` makes a curated, deterministic website ZIP; that ZIP alone adds a release version for local path installs. It never includes workspace accounts, configuration, databases or uploaded snapshots.

To update the bundled parser, install the exact reviewed npm version in a temporary directory with `npm install --ignore-scripts --no-audit --no-fund php-parser@VERSION`. Replace only `engine/third-party/php-parser/src`, LICENSE and the minimal package.json, then run every scanner and PHP smoke test. Keep the dependency version pinned and do not copy npm development dependencies or installation scripts.

Current support is PHP 8.3+ and Node 22+. Standalone Symfony Console 7/8 and Laravel 13 discovery are covered by CI. Other source Laravel versions may be scanned statically; this does not imply support for every framework's runtime semantics.
