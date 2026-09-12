<?php
namespace App\Models;
class Label extends \Illuminate\Database\Eloquent\Model
{
    public function journals() { return $this->belongsToMany(Journal::class); }
}
