<?php
namespace App\Models;
use Illuminate\Foundation\Auth\User as Authenticatable;
class User extends Authenticatable
{
    public function journals() { return $this->hasMany(Journal::class); }
}
