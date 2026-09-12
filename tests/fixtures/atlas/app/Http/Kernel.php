<?php
namespace App\Http;
class Kernel extends \Illuminate\Foundation\Http\Kernel {
    protected $middlewareAliases = [
        'auth' => \App\Http\Middleware\Authenticate::class,
        'verified' => 'Illuminate\Auth\Middleware\EnsureEmailIsVerified',
    ];
    protected $middlewareGroups = ['web' => ['auth']];
}
