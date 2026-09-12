<?php
namespace App\Http\Controllers;
use App\Models\{Journal, Entry};
class JournalController
{
    public function index() { return Journal::query()->get(); }
    public function show(Journal $journal) { return $journal; }
    public function store() { return new Journal(); }
    public function search() { return Entry::query()->get(); }
    protected function internal() { return Journal::query(); }
}
