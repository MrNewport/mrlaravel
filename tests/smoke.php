<?php
// Real Composer command smoke tests; only synthetic source in a temporary directory.
require dirname(__DIR__).'/vendor/autoload.php';

use MrNewport\MrLaravel\ReportRenderer;
use Symfony\Component\Process\Process;

$package = dirname(__DIR__);
$root = sys_get_temp_dir().'/mrlaravel-package-'.bin2hex(random_bytes(6));
$target = $root.'/My app ; $ literal';
$assertions = 0;
$check = function (bool $condition, string $message) use (&$assertions): void {
    $assertions++;
    if (! $condition) throw new RuntimeException($message);
};
$run = function (array $arguments) use ($package): Process {
    $process = new Process([PHP_BINARY, $package.'/bin/mrlaravel', ...$arguments]);
    $process->setTimeout(30);
    $process->run();
    return $process;
};
mkdir($target.'/routes', 0700, true);
mkdir($target.'/app', 0700, true);
try {
    $sentinel = $root.'/executed';
    file_put_contents($target.'/routes/web.php', "<?php\nfile_put_contents(".var_export($sentinel, true).", 'executed');\nRoute::get('/hello', fn () => 'PRIVATE_BODY');\n");
    $version = $run(['--version']);
    $check($version->isSuccessful(), 'Composer binary must boot. '.$version->getErrorOutput());
    $first = $run(['scan', $target, '--out', $root.'/first', '--name', 'A <literal> app']);
    $check($first->isSuccessful(), $first->getErrorOutput());
    $atlas = json_decode(file_get_contents($root.'/first/atlas.json'), true, flags: JSON_THROW_ON_ERROR);
    $check($atlas['counts']['routes'] === 1 && $atlas['application'] === 'A <literal> app', 'Scan output must preserve argument boundaries.');
    $check(! file_exists($sentinel), 'Target PHP must not execute.');
    $check(! str_contains(json_encode($atlas), 'PRIVATE_BODY'), 'Source body must not enter a snapshot.');
    $check(is_file($root.'/first/report.html'), 'Offline report must be written.');
    $blocked = $run(['scan', $target, '--out', $target.'/reports']);
    $check($blocked->getExitCode() === 1 && ! file_exists($target.'/reports'), 'Writes into the target must fail.');
    $check($run(['scan', $target])->getExitCode() === 1, 'Missing --out must fail.');
    $check($run(['scan', $target, '--out', $root.'/missing', '--node', $root.'/no-such-node'])->getExitCode() === 1, 'Missing Node must fail clearly.');
    if (PHP_OS_FAMILY !== 'Windows') {
        $old = $root.'/old node';
        file_put_contents($old, "#!/bin/sh\nprintf 'v20.0.0\\n'\n");
        chmod($old, 0700);
        $failure = $run(['scan', $target, '--out', $root.'/old', '--node', $old]);
        $check($failure->getExitCode() === 1 && str_contains($failure->getErrorOutput(), '22+'), 'Old Node must be rejected with runtime guidance.');
    }
    file_put_contents($target.'/routes/web.php', "\nRoute::post('/next', fn () => 'ok');\n", FILE_APPEND);
    $check($run(['scan', $target, '--out', $root.'/after'])->isSuccessful(), 'Changed source must scan.');
    $diff = $run(['diff', $root.'/first/atlas.json', $root.'/after/atlas.json']);
    $comparison = json_decode($diff->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    $check($diff->isSuccessful() && $comparison['counts'] === ['added' => 1, 'removed' => 0, 'changed' => 0], 'Diff stdout must be valid JSON and describe the real source change.');
    $check($run(['diff', $root.'/first/atlas.json', $root.'/after/atlas.json', '--out', $root.'/comparison.json'])->isSuccessful() && is_file($root.'/comparison.json'), 'Diff file output must work.');
    $check($run(['diff', $root.'/first/atlas.json', $root.'/after/atlas.json', '--out', $root.'/first/atlas.json'])->getExitCode() === 1, 'Diff cannot overwrite input.');
    file_put_contents($target.'/app/Broken.php', '<?php class { invalid');
    $partial = $run(['scan', $target, '--out', $root.'/partial']);
    $check($partial->getExitCode() === 2 && is_file($root.'/partial/report.html'), 'Parse errors must preserve exit 2 and a partial report.');
    $html = (new ReportRenderer)->render($atlas, '</script><script>bad()</script>');
    $check(str_contains($html, 'const SOURCE_BASE=null') && ! str_contains($html, '<script>bad()') && ! str_contains($html, $root), 'PHP report must safely embed metadata and omit server paths.');
    echo "Package smoke: {$assertions} assertions passed.\n";
} finally {
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) $file->isDir() ? rmdir($file->getPathname()) : unlink($file->getPathname());
    rmdir($root);
}
