<?php

namespace App\Support\Mail;

use App\Support\OrderService;
use Illuminate\Support\Facades\DB;

/** Builds the {{token}} values for order and cart e-mails (and the sample values shown in the admin preview). */
final class MailVars
{
    public static function money(float $v): string
    {
        return \App\Support\Brand::currencySymbol().number_format($v, 2);
    }

    private static function table(array $rows, array $totals): Raw
    {
        $td = 'padding:10px 0;border-bottom:1px solid #eee;font-size:14px;color:#333;';
        $html = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;border-collapse:collapse;">';
        foreach ($rows as $r) {
            $html .= '<tr><td style="'.$td.'">'.e($r['name']).($r['variant'] ? '<br><span style="color:#888;font-size:12px;">'.e($r['variant']).'</span>' : '').'</td>'
                .'<td style="'.$td.'text-align:center;white-space:nowrap;">× '.(int) $r['qty'].'</td>'
                .'<td style="'.$td.'text-align:right;white-space:nowrap;">'.self::money($r['total']).'</td></tr>';
        }
        foreach ($totals as [$label, $value, $bold]) {
            $style = 'padding:6px 0;font-size:14px;color:#333;'.($bold ? 'font-weight:bold;border-top:2px solid #111;padding-top:12px;' : '');
            $html .= '<tr><td colspan="2" style="'.$style.'text-align:right;">'.e($label).'</td><td style="'.$style.'text-align:right;white-space:nowrap;">'.e($value).'</td></tr>';
        }

        return new Raw($html.'</table>');
    }

    /** Courier and tracking number for the shipped e-mail; empty until a courier is booked. */
    private static function tracking(?string $courier, ?string $awb, ?string $url): Raw
    {
        $url = $url && preg_match('#^https?://#i', $url) ? $url : null;
        if (! $awb && ! $url) {
            return new Raw('');
        }
        $html = '<div style="margin:0 0 16px;padding:14px 16px;background:#f7f4f0;border-radius:10px;font-size:14px;line-height:1.7;color:#333;">'
            .($courier ? 'Courier: <strong>'.e($courier).'</strong><br>' : '')
            .($awb ? 'Tracking ID: <strong>'.e($awb).'</strong>' : '')
            .($url ? ($awb ? '<br>' : '').'<a href="'.e($url).'" style="color:#111;">Track your parcel</a>' : '')
            .'</div>';

        return new Raw($html);
    }

    private static function address(?array $a): Raw
    {
        if (! $a) {
            return new Raw('');
        }
        $lines = array_filter([$a['name'] ?? '', $a['line1'] ?? '', $a['line2'] ?? '', trim(($a['city'] ?? '').', '.($a['state'] ?? '').' '.($a['pincode'] ?? '')), isset($a['phone']) ? 'Phone: '.$a['phone'] : '']);

        return new Raw(implode('<br>', array_map('e', $lines)));
    }

    /** @return array<string, string|Raw> */
    public static function order(object $order, array $extra = []): array
    {
        $o = OrderService::present($order);
        $rows = array_map(fn ($i) => ['name' => $i['name'], 'variant' => $i['variantTitle'], 'qty' => $i['qty'], 'total' => $i['lineTotal']], $o['items']);
        $totals = [['Subtotal', self::money($o['subtotal']), false]];
        if ($o['discount'] > 0) {
            $totals[] = ['Discount'.($o['couponCode'] ? ' ('.$o['couponCode'].')' : ''), '-'.self::money($o['discount']), false];
        }
        $totals[] = ['Shipping', $o['shipping'] > 0 ? self::money($o['shipping']) : 'Free', false];
        if ($o['codFee'] > 0) {
            $totals[] = ['Cash on Delivery fee', self::money($o['codFee']), false];
        }
        $totals[] = ['Total', self::money($o['total']), true];

        $pay = $o['paymentMethod'] === 'cod' ? 'Cash on Delivery' : 'Online (Razorpay)';
        $status = ['paid' => 'Paid', 'pending' => 'Payment pending', 'failed' => 'Payment failed', 'refunded' => 'Refunded'][$o['paymentStatus']] ?? ucfirst((string) $o['paymentStatus']);
        $base = MailSettings::get('support_email');
        $link = Mailer::siteUrl().'/checkout/thank-you/'.$o['number'].'?token='.$order->access_token;
        $admin = Mailer::siteUrl().'/admin/orders/'.$order->id;

        return $extra + [
            'customer_name' => $o['name'], 'customer_email' => $o['email'], 'customer_phone' => $o['phone'],
            'order_number' => (string) $o['number'], 'order_total' => self::money($o['total']),
            'order_date' => \Carbon\Carbon::parse($order->created_at, 'UTC')->timezone(\App\Support\Brand::timezone())->format('j M Y'),
            'payment_method' => $pay, 'payment_status' => $status,
            'order_summary' => self::table($rows, $totals), 'shipping_address' => self::address($o['address']),
            'order_link' => $link, 'order_button' => Mailer::button('View your order', $link),
            'admin_order_link' => $admin, 'admin_order_button' => Mailer::button('Open the order', $admin),
            'support_email' => $base,
            'tracking_info' => self::tracking($order->courier_name ?? null, $order->awb_code ?? null, $order->tracking_url ?? null),
            'courier_name' => (string) ($order->courier_name ?? ''), 'awb_code' => (string) ($order->awb_code ?? ''), 'tracking_link' => (string) ($order->tracking_url ?? ''),
        ];
    }

    /** @param array<int, array<string,mixed>> $items snapshot lines of a cart @return array<string, string|Raw> */
    public static function cart(object $cart, array $extra = []): array
    {
        $items = json_decode((string) $cart->items, true) ?: [];
        $rows = array_map(fn ($i) => ['name' => $i['name'] ?? '', 'variant' => $i['variantTitle'] ?? null, 'qty' => (int) ($i['qty'] ?? 1), 'total' => (float) ($i['lineTotal'] ?? 0)], $items);
        $total = (float) $cart->subtotal;
        $recover = Mailer::siteUrl().'/cart?recover='.$cart->token;
        $unsub = Mailer::siteUrl().'/api/abandoned/unsubscribe/'.$cart->token;
        $coupon = MailSettings::get('abandoned_coupon_code');
        $admin = Mailer::siteUrl().'/admin/abandoned';

        return $extra + [
            'customer_name' => trim((string) $cart->name) !== '' ? explode(' ', trim($cart->name))[0] : 'there',
            'customer_email' => $cart->email, 'customer_phone' => $cart->phone ?: '—',
            'cart_items' => self::table($rows, [['Total', self::money($total), true]]), 'cart_total' => self::money($total),
            'coupon_code' => $coupon,
            'coupon_line' => $coupon !== '' ? new Raw('<span style="font-size:15px;line-height:1.65;color:#333;">Use code <strong>'.e($coupon).'</strong> at checkout as a little thank-you.</span>') : '',
            'recover_link' => $recover, 'recover_button' => Mailer::button('Return to my cart', $recover),
            'unsubscribe_link' => $unsub, 'minutes_idle' => (string) max(1, (int) round((time() - strtotime($cart->last_activity_at.' UTC')) / 60)),
            'admin_carts_link' => $admin, 'admin_carts_button' => Mailer::button('Open abandoned carts', $admin),
        ];
    }

    /** Made-up values so the admin can preview and test-send a template. @return array<string, string|Raw> */
    public static function sample(string $key): array
    {
        $order = (object) [
            'id' => '00000000-0000-0000-0000-000000000000', 'access_token' => 'sample', 'created_at' => now()->utc()->format('Y-m-d H:i:s'),
        ];
        $rows = [
            ['name' => 'Sample product one', 'variant' => 'Silver', 'qty' => 1, 'total' => 499.0],
            ['name' => 'Sample product two', 'variant' => null, 'qty' => 2, 'total' => 1998.0],
        ];
        $totals = [['Subtotal', self::money(2497), false], ['Shipping', 'Free', false], ['Total', self::money(2497), true]];
        $addr = ['name' => 'Aarohi Shah', 'line1' => '12 Rose Park', 'line2' => 'Near City Mall', 'city' => 'Surat', 'state' => 'Gujarat', 'pincode' => '395007', 'phone' => '9876543210'];
        $link = Mailer::siteUrl().'/checkout/thank-you/1001';
        $admin = Mailer::siteUrl().'/admin/orders';
        $coupon = MailSettings::get('abandoned_coupon_code') ?: 'WELCOME10';

        return [
            'customer_name' => 'Aarohi', 'customer_email' => 'aarohi@example.com', 'customer_phone' => '9876543210',
            'order_number' => '1001', 'order_total' => self::money(2497), 'order_date' => now()->timezone(\App\Support\Brand::timezone())->format('j M Y'),
            'payment_method' => 'Online (Razorpay)', 'payment_status' => 'Paid',
            'order_summary' => self::table($rows, $totals), 'shipping_address' => self::address($addr),
            'order_link' => $link, 'order_button' => Mailer::button('View your order', $link),
            'admin_order_link' => $admin, 'admin_order_button' => Mailer::button('Open the order', $admin),
            'cancel_reason' => 'Cancelled at your request', 'refund_amount' => self::money(2497),
            'tracking_info' => self::tracking('Delhivery', '14301234567890', 'https://shiprocket.co/tracking/14301234567890'),
            'courier_name' => 'Delhivery', 'awb_code' => '14301234567890', 'tracking_link' => 'https://shiprocket.co/tracking/14301234567890',
            'cart_items' => self::table($rows, [['Total', self::money(2497), true]]), 'cart_total' => self::money(2497),
            'coupon_code' => $coupon, 'coupon_line' => new Raw('<span style="font-size:15px;line-height:1.65;color:#333;">Use code <strong>'.e($coupon).'</strong> at checkout as a little thank-you.</span>'),
            'recover_link' => Mailer::siteUrl().'/cart', 'recover_button' => Mailer::button('Return to my cart', Mailer::siteUrl().'/cart'),
            'unsubscribe_link' => Mailer::siteUrl().'/api/abandoned/unsubscribe/sample', 'minutes_idle' => '75',
            'admin_carts_link' => Mailer::siteUrl().'/admin/abandoned', 'admin_carts_button' => Mailer::button('Open abandoned carts', Mailer::siteUrl().'/admin/abandoned'),
        ];
    }
}
