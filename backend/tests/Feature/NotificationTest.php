<?php

namespace Tests\Feature;

use App\Support\AdminAuth;
use App\Support\Notifier;
use App\Support\OrderService;
use App\Support\Push\PushTransport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** Admin notifications: a shared bell feed, system notifications to every subscribed device, and switches for the main administrator. */
class NotificationTest extends TestCase
{
    use RefreshDatabase;

    private const ORDER = '85000000-0000-0000-0000-000000000001';
    private FakePush $push;

    protected function setUp(): void
    {
        parent::setUp();
        Notifier::forget();
        $this->push = new FakePush();
        $this->app->instance(PushTransport::class, $this->push);
        $now = now()->format('Y-m-d H:i:s');
        DB::table('admin_users')->insert([
            ['id' => '86000000-0000-0000-0000-000000000001', 'email' => 'owner@example.com', 'password_hash' => AdminAuth::hashPassword('x-super-password'), 'role' => 'super', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => '86000000-0000-0000-0000-000000000002', 'email' => 'staff@example.com', 'password_hash' => AdminAuth::hashPassword('x-staff-password'), 'role' => 'admin', 'active' => 1, 'created_at' => $now, 'updated_at' => $now],
            ['id' => '86000000-0000-0000-0000-000000000003', 'email' => 'off@example.com', 'password_hash' => AdminAuth::hashPassword('x-off-password-1'), 'role' => 'admin', 'active' => 0, 'created_at' => $now, 'updated_at' => $now],
        ]);
        DB::table('admin_sessions')->insert([
            ['id' => '87000000-0000-0000-0000-000000000001', 'admin_id' => '86000000-0000-0000-0000-000000000001', 'token_hash' => hash('sha256', 'boss'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
            ['id' => '87000000-0000-0000-0000-000000000002', 'admin_id' => '86000000-0000-0000-0000-000000000002', 'token_hash' => hash('sha256', 'staff'), 'expires_at' => now()->addDay()->format('Y-m-d H:i:s')],
        ]);
    }

    private function as(string $token, string $method, string $uri, array $params = [])
    {
        return $this->call($method, $uri, $params, [config('shop.session_cookie') => $token], [], ['HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest', 'HTTP_ACCEPT' => 'application/json']);
    }

    private function order(string $method = 'cod'): object
    {
        DB::table('orders')->insert([
            'id' => self::ORDER, 'number' => 1234, 'access_token' => 'tok', 'name' => 'Asha Rao', 'email' => 'asha@example.com', 'phone' => '9876543210',
            'status' => 'open', 'payment_status' => 'pending', 'payment_method' => $method, 'fulfillment_status' => 'unfulfilled',
            'subtotal' => 1950, 'total' => 1950, 'shipping_address' => '{}',
        ]);

        return DB::table('orders')->where('id', self::ORDER)->first();
    }

    private function subscribe(string $token, string $endpoint): void
    {
        $this->as($token, 'POST', '/api/admin/notifications/subscribe', ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'pk-'.$endpoint, 'auth' => 'au']])->assertOk();
    }

    public function test_a_new_order_reaches_the_bell_and_every_subscribed_device(): void
    {
        $this->subscribe('boss', 'https://push.example.com/boss-phone');
        $this->subscribe('staff', 'https://push.example.com/staff-laptop');
        DB::table('push_subscriptions')->insert(['id' => '88000000-0000-0000-0000-000000000001', 'admin_id' => '86000000-0000-0000-0000-000000000003', 'endpoint_hash' => hash('sha256', 'x'), 'endpoint' => 'https://push.example.com/switched-off', 'p256dh' => 'p', 'auth' => 'a']);

        OrderService::notify($this->order());

        $n = DB::table('admin_notifications')->first();
        $this->assertSame('order_new', $n->event);
        $this->assertSame('New order #1234', $n->title);
        $this->assertStringContainsString('Cash on Delivery', $n->body);
        $this->assertSame('/admin/orders/'.self::ORDER, $n->url);

        // Both active admins' devices got it; a switched-off admin's device did not.
        $endpoints = array_column($this->push->lastSubs, 'endpoint');
        sort($endpoints);
        $this->assertSame(['https://push.example.com/boss-phone', 'https://push.example.com/staff-laptop'], $endpoints);
        $payload = json_decode($this->push->lastPayload, true);
        $this->assertSame('New order #1234', $payload['title']);
        $this->assertSame('/admin/orders/'.self::ORDER, $payload['url']);

        // The same order confirmed twice (payment page and webhook) is announced once.
        OrderService::notify(DB::table('orders')->where('id', self::ORDER)->first());
        $this->assertSame(1, DB::table('admin_notifications')->where('event', 'order_new')->count());
    }

    public function test_every_admin_has_their_own_unread_count_and_can_mark_it_read(): void
    {
        $this->as('boss', 'GET', '/api/admin/notifications')->assertOk()->assertJsonPath('unread', 0);   // starts clean
        $this->as('staff', 'GET', '/api/admin/notifications')->assertOk();
        sleep(1);
        OrderService::notify($this->order());

        $this->as('boss', 'GET', '/api/admin/notifications')->assertJsonPath('unread', 1)->assertJsonPath('items.0.title', 'New order #1234')->assertJsonPath('items.0.unread', true);
        $this->as('staff', 'GET', '/api/admin/notifications')->assertJsonPath('unread', 1);

        $this->as('boss', 'POST', '/api/admin/notifications/seen')->assertOk();
        $this->as('boss', 'GET', '/api/admin/notifications')->assertJsonPath('unread', 0)->assertJsonPath('items.0.unread', false);
        $this->as('staff', 'GET', '/api/admin/notifications')->assertJsonPath('unread', 1);   // someone else's read marker is separate
        $this->getJson('/api/admin/notifications', ['X-Requested-With' => 'XMLHttpRequest'])->assertStatus(401);
    }

    public function test_only_the_main_admin_chooses_which_events_are_announced(): void
    {
        $this->as('staff', 'GET', '/api/admin/notifications/settings')->assertStatus(403);
        $this->as('staff', 'POST', '/api/admin/notifications/settings', ['events' => ['order_new' => false]])->assertStatus(403);
        $this->as('staff', 'POST', '/api/admin/notifications/test')->assertStatus(403);

        $s = $this->as('boss', 'GET', '/api/admin/notifications/settings')->assertOk();
        $byKey = collect($s->json('events'))->keyBy('key');
        $this->assertTrue($byKey['order_new']['enabled']);
        $this->assertFalse($byKey['new_subscriber']['enabled']);   // quiet by default
        $this->assertCount(count(Notifier::EVENTS), $s->json('events'));

        // Switch new orders off and new subscribers on: the switches decide what is announced.
        $this->as('boss', 'POST', '/api/admin/notifications/settings', ['events' => ['order_new' => false, 'new_subscriber' => true], 'low_stock_threshold' => 5])->assertOk();
        Notifier::forget();
        OrderService::notify($this->order());
        $this->assertSame(0, DB::table('admin_notifications')->where('event', 'order_new')->count());
        $this->postJson('/api/newsletter', ['email' => 'reader@example.com'], ['X-Requested-With' => 'XMLHttpRequest'])->assertOk();
        $this->assertSame(1, DB::table('admin_notifications')->where('event', 'new_subscriber')->count());
        $this->assertSame(5, Notifier::lowStockThreshold());
    }

    public function test_the_main_admin_picks_the_notification_sound_and_every_admin_hears_it(): void
    {
        // Default: the longer built-in tone.
        $this->as('staff', 'GET', '/api/admin/notifications')->assertJsonPath('sound.tone', 'long');

        $events = ['events' => ['new_order' => true]];
        $this->as('staff', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'bell'])->assertStatus(403);
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'bell'])->assertOk();
        $this->as('staff', 'GET', '/api/admin/notifications')->assertJsonPath('sound.tone', 'bell')->assertJsonPath('sound.url', '');

        // A custom sound must be an audio file from Media; anything else is refused.
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'custom', 'sound_url' => ''])->assertStatus(422);
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'custom', 'sound_url' => 'https://evil.example/x.mp3'])->assertStatus(422);
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'custom', 'sound_url' => '/api/public/img/2026-11/library/a.png'])->assertStatus(422);
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'nope'])->assertStatus(422);
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'custom', 'sound_url' => '/api/public/img/2026-11/library/ding-abc123.mp3'])->assertOk();
        $this->as('staff', 'GET', '/api/admin/notifications')->assertJsonPath('sound.tone', 'custom')->assertJsonPath('sound.url', '/api/public/img/2026-11/library/ding-abc123.mp3');
        $this->as('boss', 'GET', '/api/admin/notifications/settings')->assertJsonPath('sound.tone', 'custom');

        // Going back to a built-in tone forgets the file.
        $this->as('boss', 'POST', '/api/admin/notifications/settings', $events + ['sound_tone' => 'classic'])->assertOk();
        $this->as('staff', 'GET', '/api/admin/notifications')->assertJsonPath('sound.tone', 'classic')->assertJsonPath('sound.url', '');
    }

    public function test_low_stock_and_sold_out_are_announced_with_the_chosen_threshold(): void
    {
        Notifier::save([], 4);
        Notifier::stock([['name' => 'Ring (Red)', 'left' => 4], ['name' => 'Chain', 'left' => 9], ['name' => 'Stud', 'left' => 0]]);
        $titles = DB::table('admin_notifications')->orderBy('created_at')->pluck('title', 'event')->all();
        $this->assertSame('Low stock: Ring (Red)', $titles['low_stock']);
        $this->assertSame('Sold out: Stud', $titles['out_of_stock']);
        $this->assertSame(2, DB::table('admin_notifications')->count());   // the chain has plenty left
    }

    public function test_cancel_refund_and_payment_events_are_announced_but_online_payments_only_once(): void
    {
        $cod = $this->order('cod');
        OrderService::markPaid($cod->id);
        $this->assertSame(1, DB::table('admin_notifications')->where('event', 'payment_received')->count());
        OrderService::refund($cod->id, 100.0, 'Refund issued', false);
        $this->assertSame(1, DB::table('admin_notifications')->where('event', 'order_refunded')->count());
        OrderService::cancel($cod->id, 'Customer changed their mind', false);
        $this->assertSame(0, DB::table('admin_notifications')->where('event', 'order_cancelled')->count());   // silent cancels (gateway failure) stay silent

        DB::table('orders')->delete();
        $online = $this->order('razorpay');
        OrderService::markPaid($online->id, 'pay_1');
        $this->assertSame(1, DB::table('admin_notifications')->where('event', 'payment_received')->count());   // not added again for an online order
        OrderService::cancel($online->id, 'Store cancelled it');
        $this->assertSame(1, DB::table('admin_notifications')->where('event', 'order_cancelled')->count());
    }

    public function test_devices_that_unsubscribed_are_forgotten_and_a_test_reaches_everyone(): void
    {
        $this->subscribe('boss', 'https://push.example.com/one');
        $this->subscribe('staff', 'https://push.example.com/two');
        $this->subscribe('staff', 'https://push.example.com/two');   // the same device twice is one device
        $this->assertSame(2, DB::table('push_subscriptions')->count());

        $this->push->gone = ['https://push.example.com/two'];
        $this->as('boss', 'POST', '/api/admin/notifications/test')->assertOk();
        $this->assertSame('Test notification', json_decode($this->push->lastPayload, true)['title']);
        $this->assertSame(1, DB::table('push_subscriptions')->count());   // the expired device was removed

        $this->as('boss', 'POST', '/api/admin/notifications/unsubscribe', ['endpoint' => 'https://push.example.com/one'])->assertOk();
        $this->assertSame(0, DB::table('push_subscriptions')->count());

        // A bad address is refused.
        $this->as('boss', 'POST', '/api/admin/notifications/subscribe', ['endpoint' => 'http://insecure.example.com/x', 'keys' => ['p256dh' => 'a', 'auth' => 'b']])->assertStatus(422);
    }

    public function test_the_real_sender_can_encrypt_and_sign_a_message_for_a_device(): void
    {
        // A device key pair like a browser makes (P-256 public key plus a 16 byte secret), and an address nobody listens on.
        $make = new \ReflectionMethod(\App\Support\Push\WebPushTransport::class, 'makeKeys');
        $make->setAccessible(true);
        $device = $make->invoke(null);
        $auth = rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');

        $result = (new \App\Support\Push\WebPushTransport())->send([
            ['id' => 'dev-1', 'endpoint' => 'https://127.0.0.1:9/push/abc', 'p256dh' => $device['publicKey'], 'auth' => $auth],
        ], json_encode(['title' => 'Hello']));

        // The message was built (encrypted and signed with our key); only the delivery failed, because nothing is there.
        $this->assertSame(['dev-1' => 'failed'], $result);
        $this->assertSame([], (new \App\Support\Push\WebPushTransport())->send([], '{}'));
    }

    public function test_the_server_makes_a_push_key_for_the_browser_once(): void
    {
        $a = $this->as('boss', 'GET', '/api/admin/notifications/push-key')->assertOk()->json('publicKey');
        $b = $this->as('staff', 'GET', '/api/admin/notifications/push-key')->assertOk()->json('publicKey');
        $this->assertNotEmpty($a);
        $this->assertSame($a, $b);
        $this->assertNotSame('', \App\Support\Secrets::get(\App\Support\Secrets::VAPID_PRIVATE));
        // The private half is never sent to the browser.
        $this->assertStringNotContainsString(\App\Support\Secrets::get(\App\Support\Secrets::VAPID_PRIVATE), json_encode($this->as('boss', 'GET', '/api/admin/notifications/push-key')->json()));
    }
}

/** Records what would have been pushed. */
class FakePush implements PushTransport
{
    /** @var list<array{id: string, endpoint: string}> */
    public array $lastSubs = [];
    public string $lastPayload = '';
    /** @var list<string> endpoints to report as gone */
    public array $gone = [];

    public function send(array $subscriptions, string $payloadJson): array
    {
        $this->lastSubs = $subscriptions;
        $this->lastPayload = $payloadJson;
        $out = [];
        foreach ($subscriptions as $s) {
            $out[$s['id']] = in_array($s['endpoint'], $this->gone, true) ? 'gone' : 'ok';
        }

        return $out;
    }
}
