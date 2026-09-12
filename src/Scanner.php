<?php

declare(strict_types=1);

namespace MrNewport\MrLaravel;

use RuntimeException;
use Symfony\Component\Console\Output\ConsoleOutputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

final class Scanner
{
    /** @param list<string> $arguments */
    public function run(array $arguments, OutputInterface $output, ?string $node = null): int
    {
        $binary = $node ?: (getenv('MRLARAVEL_NODE_BINARY') ?: (new ExecutableFinder)->find('node'));
        if (! $binary) {
            throw new RuntimeException('Node.js 22+ is required. Install Node or pass --node=/absolute/path/to/node.');
        }

        $version = new Process([$binary, '--version']);
        $version->setTimeout(10);
        try {
            $version->run();
        } catch (\Throwable $exception) {
            throw new RuntimeException('Cannot run Node.js. Check --node or MRLARAVEL_NODE_BINARY.', 0, $exception);
        }
        if (! $version->isSuccessful() || ! preg_match('/^v(\d+)\./', trim($version->getOutput()), $match) || (int) $match[1] < 22) {
            throw new RuntimeException('Node.js 22+ is required. Check node --version or pass --node=/absolute/path/to/node.');
        }

        $process = new Process([$binary, dirname(__DIR__).'/engine/bin/mrlaravel.js', ...$arguments]);
        $process->setTimeout(null);

        return $process->run(function (string $type, string $buffer) use ($output): void {
            $stream = $type === Process::ERR && $output instanceof ConsoleOutputInterface ? $output->getErrorOutput() : $output;
            $stream->write($buffer, false, OutputInterface::OUTPUT_RAW);
        });
    }
}
