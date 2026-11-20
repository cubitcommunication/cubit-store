<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** A short code per category (ER, NK, RG, BK...) that starts every product SKU in it: ER-0001, ER-0002... */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categories', function (Blueprint $t) {
            $t->string('sku_code', 6)->nullable()->after('slug');
        });

        $known = ['earring' => 'ER', 'necklace' => 'NK', 'ring' => 'RG', 'bracelet' => 'BK', 'kada' => 'BK', 'pendant' => 'PD', 'anklet' => 'AK', 'bangle' => 'BG'];
        foreach (DB::table('categories')->get(['id', 'name']) as $c) {
            $name = strtolower($c->name);
            foreach ($known as $word => $code) {
                // "Rings" must not match "Earrings": check the longer words first by order above, and skip earrings for "ring".
                if (str_contains($name, $word) && ! ($word === 'ring' && str_contains($name, 'earring'))) {
                    DB::table('categories')->where('id', $c->id)->update(['sku_code' => $code]);
                    break;
                }
            }
        }
    }

    public function down(): void
    {
        Schema::table('categories', fn (Blueprint $t) => $t->dropColumn('sku_code'));
    }
};
