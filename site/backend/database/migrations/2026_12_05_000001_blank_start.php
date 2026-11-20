<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/*
 * A new store starts blank: the home page says "Welcome to <store>", the header shows only the store's name, the footer only
 * its copyright line, and nothing else is live until the owner builds it in the admin. The earlier migrations still seed a
 * menu, an announcement bar and starter policy texts (they are part of the history), so this one clears them:
 *   - the menu is emptied (Admin -> Navigation),
 *   - the announcement bar texts are emptied (Admin -> Header & footer),
 *   - the starter policy pages (terms, privacy, returns, shipping) stay in Admin -> Policies as drafts, to be reviewed,
 *     edited and published by the owner.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('site_nav')->delete();

        foreach (['announcement', 'announcement_url', 'announcement_2', 'announcement_2_url'] as $key) {
            DB::table('site_settings')->where('key', $key)->update(['value' => '']);
        }

        DB::table('pages')->where('kind', 'policy')->update(['published' => 0]);
    }

    public function down(): void
    {
        // Nothing to restore: the owner builds the menu and publishes the policies.
    }
};
