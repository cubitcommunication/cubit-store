<?php

use Illuminate\Database\Migrations\Migration;

/**
 * Kept so the migration history stays continuous. The template has no founder photos or named people, so this does
 * nothing (it used to add three "founder" picture slots for the About page).
 */
return new class extends Migration
{
    public function up(): void
    {
    }

    public function down(): void
    {
    }
};
