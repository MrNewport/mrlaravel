<?php

declare(strict_types=1);

namespace MrNewport\MrLaravel;

use Illuminate\Support\ServiceProvider;
use MrNewport\MrLaravel\Console\DiffCommand;
use MrNewport\MrLaravel\Console\ScanCommand;

final class MrLaravelServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(Scanner::class);
        $this->app->bind(ScanCommand::class, fn ($app) => new ScanCommand($app->make(Scanner::class), $app->basePath(), 'mrlaravel:scan'));
        $this->app->bind(DiffCommand::class, fn ($app) => new DiffCommand($app->make(Scanner::class), 'mrlaravel:diff'));
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([ScanCommand::class, DiffCommand::class]);
        }
    }
}
