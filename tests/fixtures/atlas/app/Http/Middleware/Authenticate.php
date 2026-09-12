<?php
namespace App\Http\Middleware;
class Authenticate { public function handle($request, $next) { return $next($request); } }
