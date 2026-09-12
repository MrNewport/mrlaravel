<?php
namespace App\Models;
class Entry extends BaseModel
{
    public function journal() { return $this->belongsTo(Journal::class); }
    public function subject() { return $this->morphTo(); }
    public function author() { return $this->hasOneThrough(User::class, Journal::class); }
}
