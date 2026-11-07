<?php

declare(strict_types=1);

namespace MrNewport\MrLaravel;

use InvalidArgumentException;

final class ReportRenderer
{
    public const MAX_SOURCE_FILES = 100;

    public const MAX_SOURCE_FILE_BYTES = 262144;

    public const MAX_SOURCE_BYTES = 2097152;

    public const MAX_SOURCE_LINES = 10000;

    public const MAX_SOURCE_PATH_BYTES = 512;

    /**
     * The host validates atlas ownership/shape. Source bodies are embedded only by explicit opt-in.
     *
     * @param array{sources?: array<string, string>} $options Already reviewed source text, never paths to read.
     */
    public function render(array $atlas, string $mappingKey = 'offline', array $options = []): string
    {
        $sources = $this->sources($atlas, $options);
        $directory = dirname(__DIR__).'/engine/src/';
        $encode = fn ($value) => json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        // JSON.parse preserves literal object keys such as __proto__ without object-literal semantics.
        $bundle = $sources === null ? 'null' : 'JSON.parse('.$encode($encode((object) $sources)).')';
        $data = 'const ATLAS='.$encode($atlas).'; const SOURCE_BASE=null; const MAPPING_KEY='.$encode($mappingKey).'; const SOURCE_BUNDLE='.$bundle.';';
        $privacy = $sources === null
            ? 'Source links open the exact line in VS Code when its URL handler is installed. File links are a fallback; browsers may block local file links on an HTTP preview. The report contains metadata, not your source code.'
            : 'This report intentionally includes supplied source text as well as declaration metadata. Anyone receiving the HTML can read that source. Included files open here; omitted files can still use an optional local folder mapping. No application PHP is executed.';

        return strtr(file_get_contents($directory.'report.html'), [
            '/* ATLAS_CSS */' => file_get_contents($directory.'report.css'),
            '/* ATLAS_DATA */' => $data,
            '/* ATLAS_CLIENT */' => file_get_contents($directory.'source-viewer.js')."\n".file_get_contents($directory.'report-client.js'),
            '/* ATLAS_SOURCE_PRIVACY */' => $privacy,
        ]);
    }

    /** @return array<string, string>|null */
    private function sources(array $atlas, array $options): ?array
    {
        if (array_diff(array_keys($options), ['sources']) !== []) {
            throw new InvalidArgumentException('Unknown report rendering options.');
        }
        if (! array_key_exists('sources', $options)) {
            return null;
        }
        if (! is_array($options['sources']) || count($options['sources']) > self::MAX_SOURCE_FILES) {
            throw new InvalidArgumentException('Source bundles must map at most 100 relative filenames to reviewed text.');
        }
        $declared = [];
        foreach ($atlas['files'] ?? [] as $record) {
            if (is_array($record) && is_string($record['file'] ?? null)) {
                $declared[$record['file']] = true;
            }
        }
        $total = 0;
        foreach ($options['sources'] as $file => $text) {
            if (! is_string($file) || $file === '' || strlen($file) > self::MAX_SOURCE_PATH_BYTES
                || preg_match('//u', $file) !== 1 || preg_match('/[\x00-\x1f\x7f\\\\:%?#]/', $file)
                || str_starts_with($file, '/') || array_intersect(explode('/', $file), ['', '.', '..']) !== []) {
                throw new InvalidArgumentException('Source filenames must be canonical relative paths without traversal, URLs or encoded segments.');
            }
            if (! isset($declared[$file])) {
                throw new InvalidArgumentException('Every bundled source filename must occur exactly in atlas.files.');
            }
            if (! is_string($text) || preg_match('//u', $text) !== 1 || str_contains($text, "\0")) {
                throw new InvalidArgumentException('Bundled source must be UTF-8 text without NUL bytes.');
            }
            if (strlen($text) > self::MAX_SOURCE_FILE_BYTES || substr_count($text, "\n") + 1 > self::MAX_SOURCE_LINES) {
                throw new InvalidArgumentException('A bundled file exceeds 256 KiB or 10000 lines.');
            }
            $total += strlen($text);
            if ($total > self::MAX_SOURCE_BYTES) {
                throw new InvalidArgumentException('The source bundle exceeds 2 MiB.');
            }
        }

        return $options['sources'];
    }
}
