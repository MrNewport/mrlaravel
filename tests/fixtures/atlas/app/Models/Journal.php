<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Journal extends Model
{
    protected $password = 'DO_NOT_EXPORT_PROPERTY';
    public function entries() { return $this->hasMany(Entry::class)->orderBy('created_at'); }
    public function owner() { return $this->belongsTo(User::class); }
    public function labels() { return $this->belongsToMany(Label::class)->withTimestamps(); }
    public function mystery() { return $this->hasMany(config('atlas.model')); }
    public function maybe() { if (rand()) { return $this->hasOne(Entry::class); } return null; }
    public function indirect() { $relation = $this->hasMany(Entry::class); return $relation; }
    public function entryCount() { return $this->hasMany(Entry::class)->count(); }
}
