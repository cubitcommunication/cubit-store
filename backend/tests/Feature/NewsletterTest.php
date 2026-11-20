<?php

namespace Tests\Feature;

use App\Support\Data\QueryEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NewsletterTest extends TestCase
{
    use RefreshDatabase;

    private array $h = ['X-Requested-With' => 'XMLHttpRequest', 'Accept' => 'application/json'];

    public function test_an_address_is_saved_once_and_the_answer_never_reveals_duplicates(): void
    {
        $this->postJson('/api/newsletter', ['email' => 'Asha@Example.com'], $this->h)->assertOk()->assertJson(['ok' => true]);
        $this->postJson('/api/newsletter', ['email' => 'asha@example.com'], $this->h)->assertOk()->assertJson(['ok' => true]);

        $this->assertSame(1, DB::table('newsletter_subscribers')->count());
        $this->assertSame('asha@example.com', DB::table('newsletter_subscribers')->value('email'));
    }

    public function test_bad_addresses_and_cross_site_posts_are_refused(): void
    {
        $this->postJson('/api/newsletter', ['email' => 'not-an-email'], $this->h)->assertStatus(422);
        $this->postJson('/api/newsletter', [], $this->h)->assertStatus(422);
        $this->postJson('/api/newsletter', ['email' => 'a@b.co'])->assertStatus(403);   // no X-Requested-With
        $this->assertSame(0, DB::table('newsletter_subscribers')->count());
    }

    public function test_the_subscriber_list_is_private(): void
    {
        DB::table('newsletter_subscribers')->insert(['id' => '60000000-0000-0000-0000-000000000001', 'email' => 'a@b.co']);
        $d = ['table' => 'newsletter_subscribers', 'action' => 'select', 'fields' => '*', 'filters' => [], 'orders' => [], 'returning' => true, 'count' => false, 'head' => false];

        $this->assertSame('Not authorised', (new QueryEngine(false))->execute($d)['error']['message']);
        $this->assertCount(1, (new QueryEngine(true))->execute($d)['data']);
        $write = (new QueryEngine(true))->execute(['action' => 'delete', 'filters' => [['op' => 'eq', 'col' => 'id', 'value' => 'x']]] + $d);
        $this->assertSame('Not authorised', $write['error']['message']);
    }

    public function test_it_is_rate_limited(): void
    {
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/newsletter', ['email' => "u{$i}@example.com"], $this->h)->assertOk();
        }
        $this->postJson('/api/newsletter', ['email' => 'late@example.com'], $this->h)->assertStatus(429);
    }
}
