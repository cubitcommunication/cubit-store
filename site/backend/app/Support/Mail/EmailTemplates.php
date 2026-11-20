<?php

namespace App\Support\Mail;

use Illuminate\Support\Facades\DB;

/**
 * Every automatic e-mail the store sends, with its built-in wording. The owner can change the subject and text (and
 * switch an e-mail off) in Admin -> Emails; a template without a saved row uses these defaults.
 *
 * Text format: blank line = new paragraph, **bold**, and {{tokens}} that are filled in when the e-mail is sent.
 */
final class EmailTemplates
{
    public const COMMON = ['store_name', 'support_email', 'site_url'];

    private const ORDER = ['customer_name', 'customer_email', 'customer_phone', 'order_number', 'order_total', 'order_date', 'payment_method', 'payment_status', 'order_summary', 'shipping_address', 'order_link', 'order_button', 'tracking_info', 'courier_name', 'awb_code', 'tracking_link'];

    private const CART = ['customer_name', 'cart_items', 'cart_total', 'coupon_code', 'coupon_line', 'recover_link', 'recover_button', 'unsubscribe_link'];

    /** @return array<string, array{label: string, audience: string, help: string, tokens: string[], subject: string, body: string}> */
    public static function defaults(): array
    {
        return [
            'order_placed' => [
                'label' => 'Order confirmation', 'audience' => 'customer',
                'help' => 'Sent to the customer when an order is placed (cash on delivery) or its online payment is confirmed.',
                'tokens' => self::ORDER,
                'subject' => 'Your {{store_name}} order #{{order_number}} is confirmed',
                'body' => "Hi {{customer_name}},\n\nThank you for shopping with {{store_name}}! We have received your order and will start preparing it right away.\n\n{{order_summary}}\n\n{{shipping_address}}\n\n{{order_button}}\n\nNeed anything? Just reply to this e-mail or write to {{support_email}}.\n\nWith love,\nTeam {{store_name}}",
            ],
            'payment_received' => [
                'label' => 'Payment received', 'audience' => 'customer',
                'help' => 'Sent when you mark an order as paid in Admin -> Orders (for example after cash on delivery is collected).',
                'tokens' => self::ORDER,
                'subject' => 'Payment received for order #{{order_number}}',
                'body' => "Hi {{customer_name}},\n\nWe have received your payment of **{{order_total}}** for order #{{order_number}}. Thank you!\n\n{{order_summary}}\n\n{{order_button}}\n\nTeam {{store_name}}",
            ],
            'order_shipped' => [
                'label' => 'Order shipped (processing complete)', 'audience' => 'customer',
                'help' => 'Sent when you mark an order as fulfilled — the parcel is on its way.',
                'tokens' => self::ORDER,
                'subject' => 'Your {{store_name}} order #{{order_number}} is on its way',
                'body' => "Hi {{customer_name}},\n\nGood news — your order #{{order_number}} has been packed and handed to the courier.\n\n{{order_summary}}\n\nIt is going to:\n{{shipping_address}}\n\nDelivery usually takes 3 to 7 business days. If you have any questions, reply to this e-mail or write to {{support_email}}.\n\n{{tracking_info}}\n\n{{order_button}}\n\nTeam {{store_name}}",
            ],
            'order_cancelled' => [
                'label' => 'Order cancelled', 'audience' => 'customer',
                'help' => 'Sent to the customer when an order is cancelled.',
                'tokens' => array_merge(self::ORDER, ['cancel_reason']),
                'subject' => 'Your {{store_name}} order #{{order_number}} has been cancelled',
                'body' => "Hi {{customer_name}},\n\nYour order #{{order_number}} has been cancelled.\n\n{{order_summary}}\n\nIf you already paid online, the amount will be refunded to your original payment method within 5 to 7 business days. If this was not what you expected, reply to this e-mail or write to {{support_email}} and we will help.\n\nTeam {{store_name}}",
            ],
            'order_refunded' => [
                'label' => 'Refund issued', 'audience' => 'customer',
                'help' => 'Sent when an order is refunded (marked in Admin -> Orders, or confirmed by Razorpay).',
                'tokens' => array_merge(self::ORDER, ['refund_amount']),
                'subject' => 'Your refund for order #{{order_number}}',
                'body' => "Hi {{customer_name}},\n\nWe have refunded **{{refund_amount}}** for order #{{order_number}}. It usually reaches your account within 5 to 7 business days, depending on your bank.\n\nIf you do not see it after that, reply to this e-mail or write to {{support_email}} with your order number.\n\nTeam {{store_name}}",
            ],
            'abandoned_1' => [
                'label' => 'Abandoned cart — reminder 1', 'audience' => 'customer',
                'help' => 'First reminder, sent a little while after a shopper leaves without ordering.',
                'tokens' => self::CART,
                'subject' => '{{customer_name}}, you left something sparkly behind',
                'body' => "Hi {{customer_name}},\n\nYou left a few pieces in your {{store_name}} cart. We saved them for you.\n\n{{cart_items}}\n\n{{recover_button}}\n\n{{coupon_line}}\n\nNeed help choosing? Reply to this e-mail or write to {{support_email}}.\n\nTeam {{store_name}}",
            ],
            'abandoned_2' => [
                'label' => 'Abandoned cart — reminder 2', 'audience' => 'customer',
                'help' => 'Second reminder, sent the next day.',
                'tokens' => self::CART,
                'subject' => 'Still thinking it over? Your cart is waiting',
                'body' => "Hi {{customer_name}},\n\nYour {{store_name}} cart is still waiting for you. Stock of our pieces can run out quickly, so we did not want you to miss out.\n\n{{cart_items}}\n\n{{recover_button}}\n\n{{coupon_line}}\n\nTeam {{store_name}}",
            ],
            'abandoned_3' => [
                'label' => 'Abandoned cart — reminder 3 (last)', 'audience' => 'customer',
                'help' => 'Last reminder, sent a few days later. A good place to offer your discount code.',
                'tokens' => self::CART,
                'subject' => 'Last call for your {{store_name}} cart',
                'body' => "Hi {{customer_name}},\n\nThis is our last reminder: the pieces in your cart will not be held for much longer.\n\n{{cart_items}}\n\n{{coupon_line}}\n\n{{recover_button}}\n\nIf you no longer want these, you can ignore this e-mail or stop reminders: {{unsubscribe_link}}\n\nTeam {{store_name}}",
            ],
            'admin_new_order' => [
                'label' => 'New order alert', 'audience' => 'admin',
                'help' => 'Sent to your alert addresses when a new order arrives.',
                'tokens' => array_merge(self::ORDER, ['admin_order_link', 'admin_order_button']),
                'subject' => 'New order #{{order_number}} — {{order_total}}',
                'body' => "New order from **{{customer_name}}** ({{customer_email}}, {{customer_phone}}).\n\nPayment: {{payment_method}} — {{payment_status}}\n\n{{order_summary}}\n\nDeliver to:\n{{shipping_address}}\n\n{{admin_order_button}}",
            ],
            'admin_payment_received' => [
                'label' => 'Payment received alert', 'audience' => 'admin',
                'help' => 'Sent to your alert addresses when an order is marked paid.',
                'tokens' => array_merge(self::ORDER, ['admin_order_link', 'admin_order_button']),
                'subject' => 'Payment received — order #{{order_number}} ({{order_total}})',
                'body' => "Payment of **{{order_total}}** was recorded for order #{{order_number}} ({{customer_name}}).\n\n{{admin_order_button}}",
            ],
            'admin_order_cancelled' => [
                'label' => 'Order cancelled alert', 'audience' => 'admin',
                'help' => 'Sent to your alert addresses when an order is cancelled.',
                'tokens' => array_merge(self::ORDER, ['cancel_reason', 'admin_order_link', 'admin_order_button']),
                'subject' => 'Order #{{order_number}} was cancelled',
                'body' => "Order #{{order_number}} from {{customer_name}} ({{order_total}}) was cancelled.\n\nReason: {{cancel_reason}}\n\n{{order_summary}}\n\n{{admin_order_button}}",
            ],
            'admin_abandoned_cart' => [
                'label' => 'Abandoned cart alert', 'audience' => 'admin',
                'help' => 'Sent to your alert addresses when a shopper leaves a cart behind (you can phone or WhatsApp them).',
                'tokens' => ['customer_name', 'customer_email', 'customer_phone', 'cart_items', 'cart_total', 'minutes_idle', 'admin_carts_link', 'admin_carts_button'],
                'subject' => 'Abandoned cart — {{customer_name}} ({{cart_total}})',
                'body' => "**{{customer_name}}** ({{customer_email}}, {{customer_phone}}) left a cart worth **{{cart_total}}** about {{minutes_idle}} minutes ago.\n\n{{cart_items}}\n\nReminder e-mails go out automatically. You can also reach out yourself.\n\n{{admin_carts_button}}",
            ],
        ];
    }

    /** One template with any saved changes applied. @return array<string,mixed>|null */
    public static function find(string $key): ?array
    {
        $d = self::defaults()[$key] ?? null;
        if (! $d) {
            return null;
        }
        $row = DB::table('email_templates')->where('key', $key)->first();

        return array_merge($d, [
            'key' => $key,
            'subject' => $row ? $row->subject : $d['subject'],
            'body' => $row ? $row->body : $d['body'],
            'enabled' => $row ? (bool) $row->enabled : true,
            'customised' => (bool) $row,
            'defaultSubject' => $d['subject'],
            'defaultBody' => $d['body'],
        ]);
    }

    /** @return array<int, array<string,mixed>> */
    public static function all(): array
    {
        return array_values(array_filter(array_map(fn ($k) => self::find($k), array_keys(self::defaults()))));
    }
}
