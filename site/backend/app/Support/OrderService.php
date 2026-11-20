<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Support\Mail\Mailer;
use App\Support\Mail\MailVars;
use Illuminate\Support\Str;

/** Creating orders and changing their state. Every change is written to the order timeline. */
final class OrderService
{
    public static function event(string $orderId, string $message): void
    {
        DB::table('order_events')->insert([
            'id' => (string) Str::uuid(), 'order_id' => $orderId, 'message' => $message,
            'created_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);
    }

    /**
     * Places an order atomically: re-prices the basket under a row lock, checks and
     * decreases stock, then writes the order, its lines and the first timeline entry.
     *
     * @return array{order: object, problems: string[]}
     */
    public static function place(array $items, array $customer, array $address, string $method, ?string $notes, ?string $customerId, ?string $couponCode = null): array
    {
        $lowStock = [];
        $result = DB::transaction(function () use ($items, $customer, $address, $method, $notes, $customerId, $couponCode, &$lowStock) {
            $quote = Commerce::quote($items, $method, true, $couponCode, $customer['email'], $customerId, $address['state'] ?? null);
            if ($quote['couponError']) {
                return ['order' => null, 'problems' => [$quote['couponError']]];
            }
            $ok = array_values(array_filter($quote['lines'], fn ($l) => $l['issue'] === null));
            if ($quote['problems'] || ! $ok) {
                return ['order' => null, 'problems' => $quote['problems'] ?: ['Your cart is empty.']];
            }

            $now = now()->utc()->format('Y-m-d H:i:s');
            $id = (string) Str::uuid();
            $number = ((int) DB::table('orders')->lockForUpdate()->max('number') ?: 1000) + 1;

            DB::table('orders')->insert([
                'id' => $id, 'number' => $number, 'customer_id' => $customerId,
                'access_token' => bin2hex(random_bytes(24)),
                'name' => $customer['name'], 'email' => strtolower($customer['email']), 'phone' => $customer['phone'],
                'status' => 'open', 'payment_status' => 'pending', 'payment_method' => $method,
                'fulfillment_status' => 'unfulfilled',
                'subtotal' => $quote['subtotal'], 'discount_total' => $quote['discount'], 'coupon_code' => $quote['coupon']['code'] ?? null,
                'shipping_total' => $quote['shipping'], 'cod_fee' => $quote['codFee'],
                'total' => $quote['total'],
                'shipping_address' => json_encode($address, JSON_UNESCAPED_UNICODE),
                'notes' => $notes, 'created_at' => $now, 'updated_at' => $now,
            ]);

            foreach ($ok as $line) {
                DB::table('order_items')->insert([
                    'id' => (string) Str::uuid(), 'order_id' => $id, 'product_id' => $line['id'], 'variant_id' => $line['variantId'],
                    'name' => $line['name'], 'variant_title' => $line['variantTitle'],
                    'sku' => $line['sku'], 'price' => $line['price'], 'quantity' => $line['qty'],
                    'line_total' => $line['lineTotal'], 'image_url' => $line['image'], 'created_at' => $now,
                ]);
                if ($line['stock'] !== null) {
                    // A variant tracks its own stock; a product without variants tracks the product's.
                    $table = $line['variantId'] ? 'product_variants' : 'products';
                    $rowId = $line['variantId'] ?: $line['id'];
                    DB::table($table)->where('id', $rowId)->update(['stock_quantity' => DB::raw('stock_quantity - '.(int) $line['qty'])]);
                    $left = (int) DB::table($table)->where('id', $rowId)->value('stock_quantity');
                    StockLog::record($line['id'], $line['variantId'], -(int) $line['qty'], $left, 'order', $id, 'Order #'.$number);
                    $lowStock[] = ['name' => trim($line['name'].($line['variantTitle'] ? ' ('.$line['variantTitle'].')' : '')), 'left' => $left];
                }
            }

            self::event($id, 'Order placed'.($method === 'cod' ? ' — Cash on Delivery' : ' — awaiting online payment'));
            if ($quote['shippingZone']) {
                self::event($id, 'Shipping zone: '.$quote['shippingZone'].($quote['shipping'] > 0 ? ' (Rs '.number_format($quote['shipping'], 2).')' : ' (free)'));
            }
            foreach ($quote['gifts'] as $gift) {
                self::event($id, 'Free gift earned: '.$gift['label'].' (cart over Rs '.number_format($gift['amount'], 0).') — add it to the parcel');
            }
            if ($quote['coupon']) {
                Coupons::redeem($quote['coupon'], $id, $customer['email'], $customerId, $quote['discount']);
                self::event($id, 'Discount code '.$quote['coupon']['code'].' applied'.($quote['discount'] > 0 ? ' (-Rs '.number_format($quote['discount'], 2).')' : ' (free shipping)'));
            }

            return ['order' => DB::table('orders')->where('id', $id)->first(), 'problems' => []];
        });

        // Once the order is saved: tell the admins about anything that is now low or sold out.
        if ($result['order'] && $lowStock) {
            Notifier::stock($lowStock);
        }

        return $result;
    }


    /**
     * A sale made in the offline store (Inventory -> Quick sell). It is a normal, already paid and handed-over order with
     * channel "shop", so reports, the order list and the stock history cover it. Prices and stock are read from the
     * database under a row lock; the browser only sends which pieces and how many.
     *
     * @param  array<int, array{product_id: string, variant_id: ?string, qty: int}>  $lines
     * @return array{order: ?object, problems: string[]}
     */
    public static function placeShopSale(array $lines, string $method, ?string $note, ?string $adminEmail, array $customer = []): array
    {
        $lowStock = [];
        $cName = trim((string) ($customer['name'] ?? ''));
        $cPhone = trim((string) ($customer['phone'] ?? ''));
        $cAddress = trim((string) ($customer['address'] ?? ''));
        $cDob = trim((string) ($customer['dob'] ?? ''));
        $cEmail = strtolower(trim((string) ($customer['email'] ?? '')));
        $result = DB::transaction(function () use ($lines, $method, $note, $adminEmail, &$lowStock, $cName, $cPhone, $cAddress, $cDob, $cEmail, $customer) {
            $problems = [];
            $items = [];
            $unitIds = [];
            foreach ($lines as $line) {
                $qty = max(1, (int) $line['qty']);
                $product = DB::table('products')->where('id', $line['product_id'])->whereNull('archived_at')->lockForUpdate()->first();
                if (! $product) {
                    $problems[] = 'A piece in this sale was not found.';
                    continue;
                }
                $variant = null;
                if (! empty($line['variant_id'])) {
                    $variant = DB::table('product_variants')->where('id', $line['variant_id'])->where('product_id', $product->id)->lockForUpdate()->first();
                    if (! $variant) {
                        $problems[] = $product->name.': that variation was not found.';
                        continue;
                    }
                } elseif (DB::table('product_variants')->where('product_id', $product->id)->exists()) {
                    $problems[] = $product->name.': choose a size or colour.';
                    continue;
                }
                $label = trim($product->name.($variant ? ' ('.$variant->title.')' : ''));
                // A piece with its own barcode (ER-0001.01) can be sold once; a design whose pieces have barcodes is sold only by them.
                if (! empty($line['unit_code'])) {
                    $unit = DB::table('stock_units')->whereRaw('UPPER(code) = ?', [strtoupper((string) $line['unit_code'])])->lockForUpdate()->first();
                    if (! $unit || $unit->product_id !== $product->id || ($unit->variant_id ?? null) !== ($variant?->id)) {
                        $problems[] = 'The piece barcode '.$line['unit_code'].' was not found.';
                        continue;
                    }
                    if ($unit->status !== 'in_stock') {
                        $on = $unit->sold_at ? \Carbon\Carbon::parse($unit->sold_at, 'UTC')->setTimezone(\App\Support\Brand::timezone())->format('j M Y') : null;
                        $problems[] = $unit->code.' was already sold'.($on ? ' on '.$on : '').'.';
                        continue;
                    }
                    if (in_array($unit->id, $unitIds, true)) {
                        $problems[] = $unit->code.' is in this sale twice.';
                        continue;
                    }
                    $unitIds[] = $unit->id;
                    $qty = 1;
                } elseif (DB::table('stock_units')->where('product_id', $product->id)->when($variant, fn ($w) => $w->where('variant_id', $variant->id), fn ($w) => $w->whereNull('variant_id'))->exists()) {
                    $problems[] = $label.': scan the barcode on the piece itself.';
                    continue;
                }
                $stockRow = $variant ?? $product;
                $stock = $stockRow->stock_quantity === null ? null : (int) $stockRow->stock_quantity;
                if ($stock !== null && $qty > $stock) {
                    $problems[] = $stock <= 0 ? $label.' is sold out.' : 'Only '.$stock.' left of '.$label.'.';
                    continue;
                }
                $price = $variant && $variant->price !== null ? (float) $variant->price : (float) $product->price;
                $image = DB::table('product_images')->where('product_id', $product->id)->orderBy('sort_order')->value('image_url');
                $items[] = ['product' => $product, 'variant' => $variant, 'qty' => $qty, 'price' => $price, 'stock' => $stock, 'image' => $image, 'label' => $label];
            }
            if ($problems || ! $items) {
                return ['order' => null, 'problems' => $problems ?: ['Add at least one piece to the sale.']];
            }

            $now = now()->utc()->format('Y-m-d H:i:s');
            $id = (string) Str::uuid();
            $number = ((int) DB::table('orders')->lockForUpdate()->max('number') ?: 1000) + 1;
            $total = round(array_sum(array_map(fn ($i) => $i['price'] * $i['qty'], $items)), 2);

            DB::table('orders')->insert([
                // A customer record is made (or found again by e-mail / mobile) so shop buyers join the customer list.
                'id' => $id, 'number' => $number, 'customer_id' => ShopCustomers::resolve($customer), 'access_token' => bin2hex(random_bytes(24)),
                'name' => $cName !== '' ? $cName : 'Shop customer', 'email' => $cEmail, 'phone' => $cPhone,
                'status' => 'open', 'payment_status' => 'paid', 'payment_method' => $method, 'channel' => 'shop', 'fulfillment_status' => 'fulfilled',
                'subtotal' => $total, 'discount_total' => 0, 'shipping_total' => 0, 'cod_fee' => 0, 'total' => $total,
                // The address and date of birth (for birthday offers) are kept with the order; all optional.
                'shipping_address' => json_encode((object) array_filter(['name' => $cName, 'phone' => $cPhone, 'line1' => $cAddress, 'date_of_birth' => $cDob], fn ($v) => $v !== ''), JSON_UNESCAPED_UNICODE),
                'notes' => $note, 'fulfilled_at' => $now, 'created_at' => $now, 'updated_at' => $now,
            ]);

            foreach ($items as $i) {
                $p = $i['product'];
                $v = $i['variant'];
                DB::table('order_items')->insert([
                    'id' => (string) Str::uuid(), 'order_id' => $id, 'product_id' => $p->id, 'variant_id' => $v?->id,
                    'name' => $p->name, 'variant_title' => $v?->title, 'sku' => (string) (($v?->sku ?: $p->sku) ?? ''),
                    'price' => $i['price'], 'quantity' => $i['qty'], 'line_total' => round($i['price'] * $i['qty'], 2), 'image_url' => $i['image'], 'created_at' => $now,
                ]);
                if ($i['stock'] !== null) {
                    $table = $v ? 'product_variants' : 'products';
                    $rowId = $v ? $v->id : $p->id;
                    DB::table($table)->where('id', $rowId)->update(['stock_quantity' => DB::raw('stock_quantity - '.$i['qty'])]);
                    $left = (int) DB::table($table)->where('id', $rowId)->value('stock_quantity');
                    StockLog::record($p->id, $v?->id, -$i['qty'], $left, 'shop', $id, 'Shop sale #'.$number, $adminEmail);
                    $lowStock[] = ['name' => $i['label'], 'left' => $left];
                }
            }
            if ($unitIds) {
                DB::table('stock_units')->whereIn('id', $unitIds)->update(['status' => 'sold', 'order_id' => $id, 'sold_at' => $now, 'updated_at' => $now]);
            }
            $methods = ['cash' => 'Cash', 'upi' => 'UPI', 'card' => 'Card'];
            self::event($id, 'Shop sale — paid by '.($methods[$method] ?? $method).($adminEmail ? ' (entered by '.$adminEmail.')' : ''));

            return ['order' => DB::table('orders')->where('id', $id)->first(), 'problems' => []];
        });

        if ($result['order'] && $lowStock) {
            Notifier::stock($lowStock);
        }

        return $result;
    }

    /**
     * E-mails for a new order: a confirmation to the customer and an alert to the store. The wording comes from the
     * templates in Admin -> Emails. Never throws: a mail problem must not undo or block an order.
     */
    public static function notify(object $order): void
    {
        try {
            $vars = MailVars::order($order);
            Mailer::send('order_placed', $order->email, $vars, $order->id);
            Mailer::toAdmins('admin_new_order', $vars, $order->id);
            Notifier::newOrder($order);
        } catch (\Throwable $e) {
            Log::error('[order] notification failed for #'.($order->number ?? '?').': '.$e->getMessage());
        }
    }

    /** Tells the customer (and the store) that a payment was recorded by hand. */
    public static function notifyPayment(string $orderId): void
    {
        try {
            $order = DB::table('orders')->where('id', $orderId)->first();
            if ($order) {
                $vars = MailVars::order($order);
                Mailer::send('payment_received', $order->email, $vars, $order->id);
                Mailer::toAdmins('admin_payment_received', $vars, $order->id);
            }
        } catch (\Throwable $e) {
            Log::error('[order] payment e-mail failed: '.$e->getMessage());
        }
    }

    /** Tells the customer the parcel is on its way. */
    public static function notifyShipped(string $orderId): void
    {
        try {
            $order = DB::table('orders')->where('id', $orderId)->first();
            if ($order) {
                Mailer::send('order_shipped', $order->email, MailVars::order($order), $order->id);
            }
        } catch (\Throwable $e) {
            Log::error('[order] shipping e-mail failed: '.$e->getMessage());
        }
    }

    /** Records a refund on the order and tells the customer. $amount null = the whole order total. */
    public static function refund(string $orderId, ?float $amount = null, string $message = 'Refund issued', bool $email = true): bool
    {
        $order = DB::table('orders')->where('id', $orderId)->first();
        if (! $order || $order->payment_status === 'refunded') {
            return false;
        }
        $amount = $amount !== null && $amount > 0 ? min($amount, (float) $order->total) : (float) $order->total;
        DB::table('orders')->where('id', $orderId)->update(['payment_status' => 'refunded', 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
        self::event($orderId, $message.' (Rs '.number_format($amount, 2).')');
        Notifier::orderEvent('order_refunded', $order, 'Refund issued', MailVars::money($amount));
        if ($email) {
            try {
                Mailer::send('order_refunded', $order->email, MailVars::order($order, ['refund_amount' => MailVars::money($amount)]), $order->id);
            } catch (\Throwable $e) {
                Log::error('[order] refund e-mail failed: '.$e->getMessage());
            }
        }

        return true;
    }

    /** Cancels an order and puts the stock back. Safe to call twice. */
    public static function cancel(string $orderId, string $reason = 'Order cancelled', bool $notify = true): bool
    {
        $done = DB::transaction(function () use ($orderId, $reason) {
            $order = DB::table('orders')->where('id', $orderId)->lockForUpdate()->first();
            if (! $order || $order->status === 'cancelled') {
                return false;
            }
            foreach (DB::table('order_items')->where('order_id', $orderId)->get() as $item) {
                StockLog::restock($item->product_id, $item->variant_id, (int) $item->quantity, 'cancel', $orderId, 'Order #'.$order->number.' cancelled');
            }
            $now = now()->utc()->format('Y-m-d H:i:s');
            // Pieces with their own barcode go back on the shelf.
            DB::table('stock_units')->where('order_id', $orderId)->update(['status' => 'in_stock', 'order_id' => null, 'sold_at' => null, 'updated_at' => $now]);
            DB::table('orders')->where('id', $orderId)->update(['status' => 'cancelled', 'cancelled_at' => $now, 'updated_at' => $now]);
            self::event($orderId, $reason);
            if ($code = Coupons::release($orderId)) {
                self::event($orderId, "Discount code {$code} released");
            }

            return true;
        });

        if ($done && $notify) {
            try {
                $order = DB::table('orders')->where('id', $orderId)->first();
                $vars = MailVars::order($order, ['cancel_reason' => $reason]);
                Notifier::orderEvent('order_cancelled', $order, 'Order cancelled', $reason);
                Mailer::send('order_cancelled', $order->email, $vars, $order->id);
                Mailer::toAdmins('admin_order_cancelled', $vars, $order->id);
            } catch (\Throwable $e) {
                Log::error('[order] cancellation e-mail failed: '.$e->getMessage());
            }
        }

        return $done;
    }

    public static function markPaid(string $orderId, ?string $paymentId = null, string $message = 'Marked as paid'): void
    {
        DB::table('orders')->where('id', $orderId)->update(array_filter([
            'payment_status' => 'paid', 'razorpay_payment_id' => $paymentId, 'updated_at' => now()->utc()->format('Y-m-d H:i:s'),
        ], fn ($v) => $v !== null));
        self::event($orderId, $message);
        $order = DB::table('orders')->where('id', $orderId)->first();
        if ($order && $order->payment_method !== 'razorpay') {
            Notifier::orderEvent('payment_received', $order, 'Payment received');
        }
    }

    /** Public/customer-facing shape of an order (never includes the access token). */
    public static function present(object $order): array
    {
        $items = DB::table('order_items')->where('order_id', $order->id)->orderBy('created_at')->get();

        return [
            'number' => (int) $order->number,
            'status' => $order->status,
            'paymentStatus' => $order->payment_status,
            'paymentMethod' => $order->payment_method,
            'fulfillmentStatus' => $order->fulfillment_status,
            // Courier and tracking, once a courier is booked (shown to the customer on their order page).
            'delivery' => (! empty($order->awb_code) || ! empty($order->tracking_url)) ? [
                'courier' => $order->courier_name, 'awb' => $order->awb_code, 'status' => $order->shipping_status,
                'trackingUrl' => $order->tracking_url && preg_match('#^https?://#i', (string) $order->tracking_url) ? $order->tracking_url : null,
            ] : null,
            'name' => $order->name, 'email' => $order->email, 'phone' => $order->phone,
            'subtotal' => (float) $order->subtotal, 'discount' => (float) $order->discount_total, 'couponCode' => $order->coupon_code,
            'shipping' => (float) $order->shipping_total,
            'codFee' => (float) $order->cod_fee, 'total' => (float) $order->total,
            'address' => json_decode((string) $order->shipping_address, true),
            'createdAt' => \Carbon\Carbon::parse($order->created_at, 'UTC')->format('Y-m-d\TH:i:s\Z'),
            'items' => $items->map(fn ($i) => [
                'productId' => $i->product_id, 'name' => $i->name, 'variantTitle' => $i->variant_title, 'sku' => $i->sku, 'price' => (float) $i->price,
                'qty' => (int) $i->quantity, 'lineTotal' => (float) $i->line_total, 'image' => $i->image_url,
            ])->all(),
        ];
    }
}
