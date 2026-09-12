<?php
require getenv('MRLARAVEL_TEST_AUTOLOAD') ?: __DIR__.'/../vendor/autoload.php';
$router=new Illuminate\Routing\Router(new Illuminate\Events\Dispatcher, new Illuminate\Container\Container);
$router->group(['prefix'=>'admin','as'=>'admin.'],function()use($router){
    $router->resource('people.journals','App\Http\Controllers\JournalController')->parameters(['people'=>'owner'])->shallow()->only(['index','show','update'])->names(['show'=>'journal.detail']);
});
$router->apiResource('entries','App\Http\Controllers\JournalController')->except(['destroy']);
$out=[];
foreach($router->getRoutes()as$route)$out[]=['uri'=>'/'.ltrim($route->uri(),'/'),'name'=>$route->getName(),'methods'=>$route->methods()];
usort($out,fn($a,$b)=>strcmp($a['name'],$b['name']));
echo json_encode($out,JSON_UNESCAPED_SLASHES)."\n";
