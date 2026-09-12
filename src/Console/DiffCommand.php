<?php

declare(strict_types=1);

namespace MrNewport\MrLaravel\Console;

use MrNewport\MrLaravel\Scanner;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

final class DiffCommand extends Command
{
    public function __construct(private readonly Scanner $scanner, string $name = 'diff')
    {
        parent::__construct($name);
    }

    protected function configure(): void
    {
        $this->setDescription('Compare two atlas.json snapshots.')
            ->addArgument('before', InputArgument::REQUIRED, 'Earlier atlas.json')
            ->addArgument('after', InputArgument::REQUIRED, 'Later atlas.json')
            ->addOption('out', null, InputOption::VALUE_REQUIRED, 'Comparison JSON destination (defaults to stdout)')
            ->addOption('node', null, InputOption::VALUE_REQUIRED, 'Node.js 22+ executable path');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $arguments = ['diff', $input->getArgument('before'), $input->getArgument('after')];
        if ($input->getOption('out') !== null) {
            $arguments = [...$arguments, '--out', $input->getOption('out')];
        }

        return $this->scanner->run($arguments, $output, $input->getOption('node'));
    }
}
