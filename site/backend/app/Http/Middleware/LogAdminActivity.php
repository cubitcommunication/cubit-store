<?php

namespace App\Http\Middleware;

use App\Support\Activity;
use App\Support\AdminAuth;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Adds a line to the activity log for every successful admin action that has its own endpoint (saving a product,
 * updating an order, uploading a file, bulk tools, e-mail settings...). Changes made through the generic data API
 * are logged by QueryController instead, and team changes by UserController.
 */
class LogAdminActivity
{
    /** Requests that only read or preview, so there is nothing to record. */
    private const SKIP = '#^(users|activity|sessions|notifications/(seen|subscribe|unsubscribe)|emails/preview|bulk/preview|bulk/export|media/usage|export-catalogue|store-status|dashboard)#';

    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->isMethod('GET') || $response->getStatusCode() >= 400) {
            return $response;
        }
        $admin = AdminAuth::current($request);
        $path = preg_replace('#^api/admin/#', '', $request->path()) ?? '';
        if (! $admin || preg_match(self::SKIP, $path)) {
            return $response;
        }

        [$action, $area, $summary, $subject] = $this->describe($request, $path);
        Activity::log($request, $admin, $action, $area, $summary, $this->details($request), $subject[0] ?? null, $subject[1] ?? null);

        return $response;
    }

    /** @return array{0: string, 1: string, 2: string, 3: array{0?: string, 1?: string}} */
    private function describe(Request $request, string $path): array
    {
        $in = $request->all();

        if ($path === 'products/save') {
            $p = (array) ($in['payload'] ?? []);
            $name = trim((string) ($p['name'] ?? ''));

            return empty($in['id'])
                ? ['create', 'products', 'Added product “'.$name.'”', ['products', (string) ($in['id'] ?? '')]]
                : ['update', 'products', 'Updated product “'.$name.'”', ['products', (string) $in['id']]];
        }
        if (preg_match('#^orders/([\w-]+)$#', $path, $m)) {
            $number = DB::table('orders')->where('id', $m[1])->value('number');
            $what = array_diff(array_keys($in), ['note']);

            return ['update', 'orders', 'Updated order'.($number ? " #{$number}" : '').($what ? ' ('.implode(', ', array_slice($what, 0, 5)).')' : ''), ['orders', $m[1]]];
        }
        if (preg_match('#^customers/([\w-]+)/password$#', $path, $m)) {
            return ['update', 'customers', 'Set a new password for a customer', ['customers', $m[1]]];
        }
        if (preg_match('#^customers/([\w-]+)$#', $path, $m)) {
            $email = DB::table('customers')->where('id', $m[1])->value('email');

            return ['update', 'customers', 'Updated customer'.($email ? " {$email}" : ''), ['customers', $m[1]]];
        }

        return match (true) {
            $path === 'customers/bulk-marketing' => ['update', 'customers', 'Changed marketing preference for '.count((array) ($in['ids'] ?? [])).' customers', []],
            $path === 'subscribers/delete' => ['delete', 'subscribers', 'Deleted '.count((array) ($in['ids'] ?? [])).' newsletter subscribers', []],
            $path === 'bulk/commit' => ['update', 'products', 'Imported products from a file (bulk import)', []],
            $path === 'images' => ['upload', 'media', 'Uploaded a picture ('.(string) ($in['path'] ?? '').')', []],
            $path === 'images/delete' => ['delete', 'media', 'Deleted a picture ('.(string) ($in['path'] ?? '').')', []],
            $path === 'images/delete-if-unreferenced' => ['delete', 'media', 'Removed an unused picture', []],
            $path === 'media/upload' => ['upload', 'media', 'Uploaded file “'.($request->file('file')?->getClientOriginalName() ?? 'file').'” to Media', []],
            $path === 'media/delete' => ['delete', 'media', 'Deleted '.count((array) ($in['urls'] ?? [])).' file(s) from Media', []],
            $path === 'reels/video' => ['upload', 'reels', 'Uploaded a reel video', []],
            $path === 'tags/assign' => ['update', 'tags', ($in['mode'] ?? '') === 'remove' ? 'Removed tag “'.($in['tag'] ?? '').'” from products' : 'Added tag “'.($in['tag'] ?? '').'” to products', []],
            $path === 'tags/rename' => ['update', 'tags', 'Renamed tag “'.($in['from'] ?? '').'” to “'.($in['to'] ?? '').'”', []],
            $path === 'tags/delete' => ['delete', 'tags', 'Deleted tag “'.($in['tag'] ?? '').'”', []],
            str_starts_with($path, 'emails/test') => ['email', 'emails', 'Sent a test e-mail', []],
            $path === 'emails/settings' => ['update', 'emails', 'Changed e-mail settings', []],
            $path === 'emails/template' => ['update', 'emails', 'Changed an e-mail template ('.(string) ($in['key'] ?? '').')', []],
            str_starts_with($path, 'abandoned') => ['update', 'abandoned carts', 'Abandoned carts: '.$path, []],
            $path === 'integrations/secrets' => ['update', 'integrations', 'Changed secret keys ('.implode(', ', array_keys(array_filter($in, fn ($v, $k) => $k !== 'clear' && is_string($v) && $v !== '', ARRAY_FILTER_USE_BOTH))).(! empty($in['clear']) ? '; removed: '.implode(', ', (array) $in['clear']) : '').')', []],
            (bool) preg_match('#^orders/[\w-]+/shipping/(create|assign|pickup|label|track|cancel)$#', $path, $sm) => ['update', 'orders', 'Shiprocket: '.['create' => 'sent the order to Shiprocket', 'assign' => 'booked a courier', 'pickup' => 'scheduled the pickup', 'label' => 'got the shipping label', 'track' => 'refreshed tracking', 'cancel' => 'cancelled the shipment'][$sm[1]], []],
            $path === 'notifications/settings' => ['update', 'notifications', 'Changed which notifications are switched on', []],
            $path === 'notifications/test' => ['check', 'notifications', 'Sent a test notification', []],
            $path === 'integrations/test-shiprocket' => ['check', 'integrations', 'Tested the Shiprocket connection', []],
            $path === 'smtp' => ['create', 'emails', 'Added mail account “'.(string) ($in['name'] ?? '').'”', []],
            $path === 'smtp/assign' => ['update', 'emails', 'Chose the mail account for e-mail “'.(string) ($in['template'] ?? '').'”', []],
            (bool) preg_match('#^smtp/[\w-]+/delete$#', $path) => ['delete', 'emails', 'Deleted a mail account', []],
            (bool) preg_match('#^smtp/[\w-]+/default$#', $path) => ['update', 'emails', 'Made a mail account the default', []],
            (bool) preg_match('#^smtp/[\w-]+/test$#', $path) => ['email', 'emails', 'Sent a test message through a mail account', []],
            (bool) preg_match('#^smtp/[\w-]+$#', $path) => ['update', 'emails', 'Changed mail account “'.(string) ($in['name'] ?? '').'”', []],
            str_starts_with($path, 'integrations') => ['check', 'integrations', 'Tested a connected service ('.$path.')', []],
            (bool) preg_match('#^returns/[\w-]+$#', $path) => ['update', 'returns', 'Return request: '.(string) ($in['action'] ?? 'updated'), []],
            $path === 'inventory/adjust' => ['update', 'inventory', 'Adjusted stock ('.(string) ($in['mode'] ?? '').' '.(string) ($in['quantity'] ?? '').', '.(string) ($in['reason'] ?? '').')', ['products', (string) ($in['product_id'] ?? '')]],
            default => ['update', explode('/', $path)[0] ?: 'admin', 'Admin action: '.$path, []],
        };
    }

    /** What was sent, with secrets hidden and uploads reduced to a name and size. */
    private function details(Request $request): array
    {
        $out = ['method' => $request->method(), 'path' => '/'.$request->path(), 'sent' => $request->except(['data'])];
        foreach ($request->allFiles() as $key => $file) {
            if ($file instanceof \Illuminate\Http\UploadedFile) {
                $out['files'][$key] = ['name' => $file->getClientOriginalName(), 'size' => $file->getSize()];
            }
        }

        return $out;
    }
}
