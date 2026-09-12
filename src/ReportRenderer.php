<?php

declare(strict_types=1);

namespace MrNewport\MrLaravel;

final class ReportRenderer
{
    public function render(array $atlas, string $mappingKey = 'offline'): string
    {
        $directory = dirname(__DIR__).'/engine/src/';
        $encode = fn ($value) => json_encode($value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $data = 'const ATLAS='.$encode($atlas).'; const SOURCE_BASE=null; const MAPPING_KEY='.$encode($mappingKey).';';

        return str_replace(['/* ATLAS_CSS */', '/* ATLAS_DATA */', '/* ATLAS_CLIENT */'], [file_get_contents($directory.'report.css'), $data, file_get_contents($directory.'report-client.js')], file_get_contents($directory.'report.html'));
    }
}
