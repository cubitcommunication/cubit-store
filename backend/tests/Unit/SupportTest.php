<?php

namespace Tests\Unit;

use App\Support\Bulk\Csv;
use App\Support\Media;
use App\Support\Seo;
use Tests\TestCase;

class SupportTest extends TestCase
{
    public function test_csv_round_trip_keeps_quotes_commas_and_newlines(): void
    {
        $csv = Csv::build([['Product Name' => 'Ring, "Rose"', 'SKU' => 'R-1', 'Description' => "line1\nline2"]]);
        ['records' => $records, 'missingColumns' => $missing] = Csv::parseRecords($csv);

        $this->assertSame([], $missing);
        $this->assertSame('Ring, "Rose"', $records[0]['Product Name']);
        $this->assertSame("line1\nline2", $records[0]['Description']);
    }

    public function test_csv_cells_cannot_inject_spreadsheet_formulas(): void
    {
        $this->assertSame('"\'=HYPERLINK(1)"', Csv::sanitizeCell('=HYPERLINK(1)'));
        $this->assertSame('"\'@x"', Csv::sanitizeCell('@x'));
        $this->assertSame('"safe"', Csv::sanitizeCell('safe'));
    }

    public function test_csv_value_helpers(): void
    {
        $this->assertTrue(Csv::parseBoolean('Yes'));
        $this->assertFalse(Csv::parseBoolean(''));
        $this->assertNull(Csv::parseBoolean('maybe'));
        $this->assertTrue(Csv::parseVisibility('Published'));
        $this->assertFalse(Csv::parseVisibility(''));
        $this->assertNull(Csv::parseVisibility('live'));
        $this->assertSame('blue-stone-choker', Csv::slugify('  Blue Stone Choker! '));
        $this->assertTrue(Csv::isValidHttpUrl('https://example.com/a.jpg'));
        $this->assertFalse(Csv::isValidHttpUrl('javascript:alert(1)'));
    }

    public function test_media_keys_must_be_safe_image_paths(): void
    {
        $this->assertTrue(Media::isSafeKey('products/6f1c.webp'));
        $this->assertTrue(Media::isSafeKey('media/abc.jpg'));
        foreach (['../x.png', 'products/../../x.png', '/etc/passwd', 'a.php', 'products/a.png.php', '.htaccess', 'p//a.png', ''] as $bad) {
            $this->assertFalse(Media::isSafeKey($bad), $bad);
        }
    }

    public function test_prices_use_indian_digit_grouping(): void
    {
        $this->assertSame('₹499', Seo::price(499));
        $this->assertSame('₹1,299', Seo::price(1299));
        $this->assertSame('₹12,500', Seo::price(12500));
        $this->assertSame('₹1,25,000', Seo::price(125000));
    }

    public function test_meta_tags_are_escaped(): void
    {
        $html = Seo::tags('/x', 'A "quoted" <title>', 'desc & more', null, 'website', false, [['name' => '</script><script>alert(1)</script>']]);

        $this->assertStringNotContainsString('<title>', str_replace('<title data-shop-ssr>', '', $html));
        $this->assertStringContainsString('&quot;quoted&quot;', $html);
        $this->assertStringNotContainsString('</script><script>', $html);
    }
}
