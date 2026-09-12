<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\{JournalController as Journal, HealthController};

Route::get('/', [Journal::class, 'index'])->name('home');
Route::middleware(['auth', 'throttle:60,1'])->prefix('workspace')->name('workspace.')->group(function () {
    Route::get('/journals', [Journal::class, 'index'])->name('journals.index');
    Route::group(['prefix' => 'journals', 'middleware' => ['verified']], function () {
        Route::get('/{journal}', [Journal::class, 'show'])->name('journals.show');
        Route::post('/', [Journal::class, 'store'])->withoutMiddleware('verified');
    });
});
Route::controller(Journal::class)->prefix('api')->group(function () {
    Route::match(['GET', 'POST'], '/search', 'search')->name('search');
});
Route::get('/health', HealthController::class);
Route::get('/about', fn () => 'Never export response bodies');
Route::view('/help', 'help', ['private' => 'DO_NOT_EXPORT_LITERAL']);
Route::redirect('/old', '/journals');
Route::domain('{team}.example.test')->group(function () {
    Route::get('/team', [Journal::class, 'index']);
});
// Dynamic constructs must never look resolved.
Route::get(config('atlas.path'), [Journal::class, 'show']);
Route::middleware(config('atlas.middleware'))->get('/guarded', [Journal::class, 'index']);
Route::get('/dynamic', $controller);
Route::prefix($prefix)->group(function () {
    Route::get('/unknown-prefix', [Journal::class, 'index']);
});
if (config('features.preview')) {
    Route::get('/preview', [Journal::class, 'index']);
}
Route::resource('journals', Journal::class);
Route::get('/missing', [Journal::class, 'missing']);
Route::group($attributes, function () { Route::get('/unknown-group', 'index'); });
Route::get('/secret/token=SUPER_PRIVATE_VALUE', [Journal::class, 'index']);
Route::get('/contact/person@example.test', [Journal::class, 'index']);
