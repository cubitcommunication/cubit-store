<?php

namespace App\Support\Push;

/** Sends one web-push message to many devices. Swapped for a recording fake in tests. */
interface PushTransport
{
    /**
     * @param  list<array{id: string, endpoint: string, p256dh: string, auth: string}>  $subscriptions
     * @return array<string, 'ok'|'gone'|'failed'> the result for each subscription id ('gone' = the device unsubscribed)
     */
    public function send(array $subscriptions, string $payloadJson): array;
}
