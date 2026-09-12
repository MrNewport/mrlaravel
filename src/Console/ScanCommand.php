<?php

declare(strict_types=1);

namespace MrNewport\MrLaravel\Console;

use MrNewport\MrLaravel\Scanner;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

final class ScanCommand extends Command
{
    public function __construct(private readonly Scanner $scanner, private readonly ?string $root = null, string $name = 'scan')
    {
        parent::__construct($name);
    }

    protected function configure(): void
    {
        $this->setDescription('Map Laravel declarations into atlas.json and an offline report.')
            ->addArgument('path', $this->root === null ? InputArgument::REQUIRED : InputArgument::OPTIONAL, 'Laravel project directory', $this->root)
            ->addOption('out', null, InputOption::VALUE_REQUIRED, 'Required output directory, outside the target project')
            ->addOption('name', null, InputOption::VALUE_REQUIRED, 'Application label', 'Application')
            ->addOption('node', null, InputOption::VALUE_REQUIRED, 'Node.js 22+ executable path')
            ->setHelp('Review diagnostics in every report. Exit 2 means a partial report with PHP parse errors. No snapshot is uploaded.');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if (! is_string($input->getOption('out')) || $input->getOption('out') === '') {
            throw new \InvalidArgumentException('The --out option is required and must be outside the target project.');
        }

        return $this->scanner->run(['scan', $input->getArgument('path'), '--out', $input->getOption('out'), '--name', $input->getOption('name')], $output, $input->getOption('node'));
    }
}
