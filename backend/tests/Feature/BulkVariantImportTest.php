<?php

namespace Tests\Feature;

use App\Support\Bulk\BulkService;
use App\Support\Bulk\Csv;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Bulk import of product variants: a catalogue sold in packs or sizes has to arrive in one file,
 * and a second import of that file must update it rather than duplicate it.
 */
class BulkVariantImportTest extends TestCase
{
    use RefreshDatabase;

    private function csv(string $variants): string
    {
        return Csv::build([[
            'Product Name' => '9 inch Round Plate',
            'SKU' => 'P9-ROUND',
            'Slug' => 'p9-round',
            'Price' => '199',
            'Category' => 'Plates',
            'Material' => 'Bagasse',
            'Visibility' => 'Published',
            'Option Name' => 'Pack',
            'Variants' => $variants,
        ]]);
    }

    public function test_it_creates_variants_and_the_product_option_list(): void
    {
        (new BulkService)->runImport($this->csv('25 | 199 | 275 | 120; 50 | 380 | 500; 100 | 699 | 940 | 0'), 'create');

        $product = DB::table('products')->where('slug', 'p9-round')->first();
        $this->assertNotNull($product);

        $variants = DB::table('product_variants')->where('product_id', $product->id)->orderBy('sort_order')->get();
        $this->assertCount(3, $variants);
        $this->assertSame('25', $variants[0]->title);
        $this->assertEqualsWithDelta(199.0, (float) $variants[0]->price, 0.01);
        $this->assertEqualsWithDelta(275.0, (float) $variants[0]->compare_at_price, 0.01);
        $this->assertSame(120, (int) $variants[0]->stock_quantity);
        // A blank stock cell means this variant's stock is not tracked; 0 means sold out.
        $this->assertNull($variants[1]->stock_quantity);
        $this->assertSame(0, (int) $variants[2]->stock_quantity);

        $options = json_decode((string) $product->options, true);
        $this->assertSame('Pack', $options[0]['name']);
        $this->assertSame(['25', '50', '100'], $options[0]['values']);
    }

    public function test_importing_the_same_file_again_updates_instead_of_duplicating(): void
    {
        $service = new BulkService;
        $service->runImport($this->csv('25 | 199 | 275 | 120'), 'create');
        $service->runImport($this->csv('25 | 210 | 275 | 80'), 'update');

        $product = DB::table('products')->where('slug', 'p9-round')->first();
        $variants = DB::table('product_variants')->where('product_id', $product->id)->get();

        $this->assertCount(1, $variants);
        $this->assertEqualsWithDelta(210.0, (float) $variants[0]->price, 0.01);
        $this->assertSame(80, (int) $variants[0]->stock_quantity);
    }

    public function test_a_bad_variant_price_stops_the_row(): void
    {
        $result = (new BulkService)->previewImport($this->csv('25 | abc'), 'create');

        $this->assertSame(0, DB::table('products')->count());
        $this->assertNotEmpty(json_encode($result));
        $this->assertStringContainsString('must be a number', json_encode($result));
    }

    public function test_the_export_round_trips_the_variants(): void
    {
        (new BulkService)->runImport($this->csv('25 | 199 | 275 | 120; 50 | 380 | 500'), 'create');

        $csv = (new BulkService)->buildProductCsv();
        $records = Csv::parseRecords($csv)['records'];

        $this->assertSame('Pack', $records[0]['Option Name']);
        $this->assertStringContainsString('25 | 199 | 275 | 120', $records[0]['Variants']);
        $this->assertStringContainsString('50 | 380 | 500 |', $records[0]['Variants']);
    }
}
