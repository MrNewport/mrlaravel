<?php

declare(strict_types=1);

require dirname(__DIR__).'/vendor/autoload.php';

use MrNewport\MrLaravel\ReportRenderer;

$assertions = 0;
$check = function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (! $condition) { throw new RuntimeException($message); }
};
$atlas = ['schemaVersion' => 1, 'application' => 'Included source fixture', 'tool' => ['name' => 'MrLaravel', 'version' => '1.1.0'], 'files' => [['file' => 'app/Models/Example.php', 'lines' => 4, 'status' => 'parsed']], 'routes' => [], 'controllers' => [], 'models' => [], 'relationships' => [], 'middleware' => [], 'diagnostics' => [], 'edges' => [], 'boundaries' => [], 'counts' => ['files' => 1]];
$renderer = new ReportRenderer;
$reject = function (array $snapshot, array $options, string $message) use ($renderer, $check): void {
    try { $renderer->render($snapshot, 'source-test', $options); }
    catch (InvalidArgumentException) { $check(true, $message); return; }
    $check(false, $message);
};
$decodeBundle = function (string $html): array {
    $prefix = 'const SOURCE_BUNDLE=JSON.parse(';
    $start = strpos($html, $prefix);
    if ($start === false) { throw new RuntimeException('Missing source data.'); }
    $start += strlen($prefix);
    for ($position = $start + 1; $position < strlen($html); $position++) {
        if ($html[$position] === '\\') { $position++; continue; }
        if ($html[$position] === '"') {
            return json_decode(json_decode(substr($html, $start, $position - $start + 1), true, flags: JSON_THROW_ON_ERROR), true, flags: JSON_THROW_ON_ERROR);
        }
    }
    throw new RuntimeException('Invalid source data encoding.');
};

$default = $renderer->render($atlas, 'same-key');
$check($default === $renderer->render($atlas, 'same-key', []), 'The existing two-argument API and empty options must match.');
$check(str_contains($default, 'const SOURCE_BASE=null;') && str_contains($default, 'const SOURCE_BUNDLE=null;'), 'Default PHP reports must have neither a server path nor source bodies.');
$check(str_contains($default, 'The report contains metadata, not your source code.'), 'Default privacy copy must remain accurate.');
$check(str_contains($default, 'source-folder-dialog') && str_contains($default, 'sessionStorage'), 'Existing offline/local folder mapping remains available.');
$source = "<?php\n// </script><img src=x onerror=alert(1)>\n// /* ATLAS_CLIENT */ /* ATLAS_CSS */ /* ATLAS_DATA */ /* ATLAS_SOURCE_PRIVACY */\nclass Example {}\n";
$html = $renderer->render($atlas, '</script><script>bad()</script>', ['sources' => ['app/Models/Example.php' => $source]]);
$check(! str_contains($html, '</script><img') && ! str_contains($html, '<script>bad()'), 'Source and mapping text must not become executable HTML.');
$check($decodeBundle($html) === ['app/Models/Example.php' => $source], 'Source text, including all template marker strings, must round-trip exactly.');
$check(str_contains($html, 'intentionally includes supplied source text'), 'Bundled reports must disclose intentional source inclusion.');
$check(str_contains($html, 'aria-labelledby="included-source-heading"') && str_contains($html, 'aria-label="Included source code"'), 'The source dialog and code region must be named.');
$check(str_contains($html, 'aria-labelledby="boundaries-heading"') && str_contains($html, 'aria-labelledby="source-folder-heading"'), 'Existing dialogs must have accessible names.');
$check(str_contains($html, 'role="region" aria-label="Findings"') && str_contains($html, 'href="#main-content"'), 'Findings and the main landmark must be keyboard reachable and named.');
$check(str_contains($html, 'literal=make(\'code\',text)') && ! str_contains(file_get_contents(dirname(__DIR__).'/engine/src/source-viewer.js'), 'innerHTML'), 'Source display must use text content, never HTML parsing.');

foreach (['../secret.php', 'app/../secret.php', './app/A.php', '/tmp/A.php', 'C:/App/A.php', 'app\\A.php', 'https://example.test/A.php', 'app//A.php', 'app/%2e%2e/A.php', 'app/A.php?x', "app/A\0.php", "app/\xC3\x28.php"] as $path) {
    $input = $atlas; $input['files'] = [['file' => $path]];
    $reject($input, ['sources' => [$path => 'text']], 'Reject unsafe or ambiguous source path.');
}
$reject($atlas, ['sources' => ['app/NotDeclared.php' => 'text']], 'Source files must be explicitly listed in the atlas.');
foreach ([null, false, 'file://app/Models/Example.php'] as $bad) { $reject($atlas, ['sources' => $bad], 'Source bundles must be maps.'); }
foreach ([false, [], "bad\0text", "bad\xC3\x28"] as $bad) { $reject($atlas, ['sources' => ['app/Models/Example.php' => $bad]], 'Source values must be valid text.'); }
$reject($atlas, ['source_base' => '/private/server'], 'Unknown renderer options must fail.');
$check(str_contains($renderer->render($atlas, 'empty', ['sources' => []]), 'SOURCE_BUNDLE=JSON.parse'), 'An explicit empty source map must be supported.');

$unread = $atlas; $unread['files'] = [['file' => 'app/DoesNotExist.php']];
$check($decodeBundle($renderer->render($unread, 'no-read', ['sources' => ['app/DoesNotExist.php' => 'provided text']]))['app/DoesNotExist.php'] === 'provided text', 'Bundled filenames must never be opened from disk.');
$prototype = $atlas; $prototype['files'] = [['file' => '__proto__']];
$check($decodeBundle($renderer->render($prototype, 'literal-key', ['sources' => ['__proto__' => 'literal text']])) === ['__proto__' => 'literal text'], 'JSON object keys must retain literal meaning.');
$unicode = $atlas; $unicode['files'] = [['file' => 'app/Models/Café.php']];
$check($decodeBundle($renderer->render($unicode, 'unicode', ['sources' => ['app/Models/Café.php' => "<?php // café\n"]]))['app/Models/Café.php'] === "<?php // café\n", 'UTF-8 filenames/text must round-trip.');

$fullFile = str_repeat('x', ReportRenderer::MAX_SOURCE_FILE_BYTES);
$check($decodeBundle($renderer->render($atlas, 'file-boundary', ['sources' => ['app/Models/Example.php' => $fullFile]]))['app/Models/Example.php'] === $fullFile, 'Exact per-file byte boundary must work.');
$reject($atlas, ['sources' => ['app/Models/Example.php' => $fullFile.'x']], 'Per-file byte overflow must fail.');
$lines = str_repeat("x\n", ReportRenderer::MAX_SOURCE_LINES - 1);
$check($decodeBundle($renderer->render($atlas, 'line-boundary', ['sources' => ['app/Models/Example.php' => $lines]]))['app/Models/Example.php'] === $lines, 'Exact line boundary must work.');
$reject($atlas, ['sources' => ['app/Models/Example.php' => $lines."\n"]], 'Line overflow must fail.');
$map = []; $snapshot = $atlas; $snapshot['files'] = [];
for ($i = 0; $i < ReportRenderer::MAX_SOURCE_FILES; $i++) { $file = 'app/F'.$i.'.php'; $snapshot['files'][] = ['file' => $file]; $map[$file] = ''; }
$check(count($decodeBundle($renderer->render($snapshot, 'count-boundary', ['sources' => $map]))) === ReportRenderer::MAX_SOURCE_FILES, 'Exact file-count boundary must work.');
$map['app/Extra.php'] = ''; $snapshot['files'][] = ['file' => 'app/Extra.php'];
$reject($snapshot, ['sources' => $map], 'File-count overflow must fail.');
$map = []; $snapshot['files'] = [];
for ($i = 0; $i < 8; $i++) { $file = 'app/Total'.$i.'.php'; $map[$file] = $fullFile; $snapshot['files'][] = ['file' => $file]; }
$check(count($decodeBundle($renderer->render($snapshot, 'total-boundary', ['sources' => $map]))) === 8, 'Exact total-byte boundary must work.');
$map['app/Overflow.php'] = 'x'; $snapshot['files'][] = ['file' => 'app/Overflow.php'];
$reject($snapshot, ['sources' => $map], 'Total-byte overflow must fail.');
$long = str_repeat('a', ReportRenderer::MAX_SOURCE_PATH_BYTES - 4).'.php'; $snapshot['files'] = [['file' => $long]];
$check($decodeBundle($renderer->render($snapshot, 'path-boundary', ['sources' => [$long => '']])) === [$long => ''], 'Exact path byte boundary must work.');
$reject($snapshot, ['sources' => [$long.'x' => '']], 'Path overflow must fail.');
echo "Source renderer: {$assertions} assertions passed.\n";
