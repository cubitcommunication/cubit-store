<?php

use App\Support\Brand;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Policy pages (Terms, Privacy, Cancellation & Refund, Shipping & Exchange) are pages of kind "policy": the same page
 * builder and table as ordinary pages, shown at /policies/<slug> and linked from the footer. They are added published
 * with starting text that the owner edits in Admin -> Policies. A policy that already exists is left alone.
 */
return new class extends Migration
{
    private const UPDATED = 'Last updated: 14 November 2026';

    private function pages(): array
    {
        $contact = Brand::name()."\nE-mail: ".Brand::get('support_email')."\nPhone / WhatsApp: ".Brand::get('phone_display')."\nWebsite: ".Brand::domainLabel()."\n\nWe reply on working days, usually within one business day.";

        return [
            [
                'slug' => 'terms-and-conditions',
                'title' => 'Terms and Conditions',
                'description' => 'The terms for browsing, enquiring and buying from {brand}: orders, prices, payments, shipping, returns and your responsibilities.',
                'intro' => 'These terms apply when you visit example.com, enquire about our products or place an order. By using the website you agree to them. If you do not agree, please do not use the website.',
                'sections' => [
                    ['About {brand}', "{brand} sells products online. In these terms “{brand}”, “we”, “us” and “our” mean the {brand} brand and its owners, and “you” means the person using the website."],
                    ['Products and availability', "We try to show every piece accurately, but photographs, screens and lighting can change how colour and finish look, and handmade or finished pieces can vary slightly. All products are subject to availability. If a product is not available after you order, we will tell you and offer a replacement or a full refund."],
                    ['Enquiries and orders', "You can enquire about a piece on WhatsApp, and when checkout is switched on you can also order on the website. An order is accepted only when we confirm it by message or e-mail. We may decline or cancel an order, for example because of stock, a pricing error, a delivery address we cannot serve or suspected misuse; if you have already paid we will refund you in full."],
                    ['Prices and payment', "All prices are in Indian Rupees (INR) and include applicable taxes unless stated otherwise. Delivery charges, if any, are shown at checkout before you pay. You can pay online through Razorpay (cards, UPI, net banking and wallets) or, where offered, by cash on delivery. Online payments are processed by Razorpay; we never see or store your card, UPI or bank details. Prices can change without notice, but a price confirmed in your order does not change."],
                    ['Shipping, cancellation, refunds and exchange', "These are explained in our Shipping and Exchange policy and our Cancellation and Refund policy. They form part of these terms."],
                    ['Your account', "If you create an account you must give correct details and keep your password private. You are responsible for what happens under your account. Tell us at once if you think someone else has used it."],
                    ['Acceptable use', "Do not misuse the website: no unlawful use, no attempts to break or overload it, no collecting data from it by automated means, and no copying of our text or pictures to pass off as your own."],
                    ['Intellectual property', "The {brand} name, logo, photographs, designs and text on this website belong to {brand} or are used with permission. You may not copy, reuse or publish them without our written consent."],
                    ['Limitation of liability', "We provide the website and products with reasonable care. To the extent the law allows, {brand} is not liable for indirect or consequential loss, or for delays or failures caused by events outside our control (for example courier delays, network failures or natural events). Nothing in these terms limits a right you have under Indian consumer law."],
                    ['Governing law', "These terms are governed by the laws of India. Any dispute will first be discussed with us in good faith; if it cannot be settled, the courts of India with jurisdiction over the place where {brand} operates will decide it."],
                    ['Changes to these terms', "We may update these terms from time to time. The date at the top shows when they were last changed. Using the website after a change means you accept the new terms."],
                    ['Contact us', $contact],
                ],
            ],
            [
                'slug' => 'privacy-policy',
                'title' => 'Privacy Policy',
                'description' => 'What personal information {brand} collects, how it is used and protected, who it is shared with, and the choices you have.',
                'intro' => '{brand} respects your privacy. This policy explains what information we collect when you use example.com, why we collect it, who we share it with and how you can control it.',
                'sections' => [
                    ['Information we collect', "• Details you give us: name, phone number, e-mail address, delivery and billing address, order details, and the messages you send us (for example on WhatsApp, the contact form or the newsletter).\n• Account details if you create an account: e-mail, password (stored only in scrambled form) and saved addresses.\n• Payment details: payments are handled by Razorpay. We receive only the payment status and reference, never your full card, UPI or bank details.\n• Technical data: device and browser type, pages visited and approximate location, collected through cookies and similar tools."],
                    ['How we use it', "• To take, deliver and support your orders and enquiries.\n• To send order updates and, if you agreed, news and offers (you can unsubscribe at any time).\n• To keep the website secure and prevent fraud.\n• To understand how the website is used and improve it.\n• To meet legal and accounting duties."],
                    ['Who we share it with', "We do not sell your personal information. We share only what is needed with: payment providers (Razorpay) to take payment; courier and logistics partners to deliver your order; e-mail, messaging and website hosting services that help us run the shop; analytics tools (such as Google Analytics, Google Tag Manager and Microsoft Clarity) that show us how the website is used; and authorities when the law requires it."],
                    ['Cookies', "We use cookies and similar technologies to keep you signed in, remember your cart and understand website traffic. You can block or delete cookies in your browser settings; some parts of the website may then not work properly."],
                    ['How long we keep it', "We keep order and invoice records for as long as the law requires, and other information only as long as it is needed for the purpose it was collected for. You can ask us to delete your account and personal information, except records we must keep by law."],
                    ['How we protect it', "The website uses HTTPS, passwords are stored in scrambled form, and access to customer data is limited to the people who need it. No online service is completely risk-free, but we take reasonable steps to protect your information."],
                    ['Your choices and rights', "You can ask us to show you the information we hold about you, correct it, delete it, or stop sending you marketing messages. Write to us using the details below and we will respond within a reasonable time, as required by applicable Indian law including the Digital Personal Data Protection Act, 2023."],
                    ['Children', "The website is meant for adults. We do not knowingly collect information from children under 18 without a parent or guardian's consent."],
                    ['Links to other websites', "Our pages may link to other websites (for example Instagram, Facebook or Razorpay). We are not responsible for their privacy practices; please read their policies."],
                    ['Changes to this policy', "We may update this policy from time to time. The date at the top shows the latest version."],
                    ['Contact us', $contact],
                ],
            ],
            [
                'slug' => 'cancellation-and-refund',
                'title' => 'Cancellation and Refund',
                'description' => 'How to cancel a {brand} order, when you can get a refund, and how long refunds take.',
                'intro' => 'We want you to be happy with your {brand} order. This policy explains when an order can be cancelled and how refunds work.',
                'sections' => [
                    ['Cancelling an order', "You can cancel an order any time before it is dispatched. Send us your order number on WhatsApp (+91 75748 80807) or by e-mail (support@example.com) as soon as possible. Once an order has been handed to the courier it can no longer be cancelled, but you may still be able to exchange it (see our Shipping and Exchange policy)."],
                    ['When we cancel', "We may cancel an order if an item is out of stock, a price or product detail was shown wrongly, or we cannot deliver to your address. If we cancel, we will tell you and refund any amount you have paid in full."],
                    ['When you are eligible for a refund', "• Your order is cancelled before dispatch.\n• The item is out of stock or we cancel the order.\n• The item arrives damaged, defective or different from what you ordered, and you tell us within 48 hours of delivery with clear photos and an unboxing video.\n• A payment was deducted but the order was not confirmed."],
                    ['How refunds are paid', "Refunds are sent to the original payment method (card, UPI, net banking or wallet) and usually reach you within 5 to 7 business days after we approve the refund; some banks take longer. For cash on delivery orders we will refund by bank transfer or UPI to the account you give us. We will confirm by message or e-mail when the refund has been issued."],
                    ['Failed or duplicate payments', "If money is deducted but your order is not confirmed, or you are charged twice, the extra amount is automatically reversed by the payment provider, normally within 5 to 7 business days. If it does not arrive, write to us with the payment reference and we will help."],
                    ['What is not refundable', "• Items that have been worn, used, altered or damaged after delivery.\n• Items returned without their original packaging or without proof of the problem.\n• Shipping charges, unless the item reached you damaged or wrong.\nFor hygiene reasons we cannot take back earrings that have been worn."],
                    ['Contact us', $contact],
                ],
            ],
            [
                'slug' => 'shipping-and-exchange',
                'title' => 'Shipping and Exchange',
                'description' => '{brand} delivery areas, processing and delivery times, shipping charges, tracking, and how to exchange a damaged or wrong item.',
                'intro' => 'This policy explains how we ship your {brand} order and how exchanges work.',
                'sections' => [
                    ['Where we deliver', "We currently deliver across India to every pin code served by our courier partners. We do not ship outside India at the moment."],
                    ['Processing time', "Orders are packed and handed to the courier within 1 to 3 business days after your order is confirmed (and payment received, for online orders). During festive sales it can take a little longer; we will let you know."],
                    ['Delivery time', "Delivery usually takes 3 to 7 business days after dispatch, and up to 10 business days for remote areas. These are estimates, and the courier's schedule can change them."],
                    ['Shipping charges', "Any shipping charge, and any free-shipping offer, is shown at checkout before you pay. Cash on delivery may carry a small handling fee, which is also shown before you confirm."],
                    ['Tracking', "When your order is dispatched we send you the courier name and tracking details by WhatsApp or e-mail. If you have not received them within 4 business days of ordering, please contact us."],
                    ['Delivery attempts and address', "Please give a complete address and a phone number that is reachable. If a delivery fails because of a wrong address or because nobody is available after repeated attempts, the parcel may come back to us; we will contact you to resend it, and the shipping charge may be asked again."],
                    ['Damaged in transit', "Please record a continuous unboxing video when you open the parcel. If an item is damaged, defective or not what you ordered, write to us within 48 hours of delivery with the video and photos, and we will arrange a replacement, an exchange or a refund as per our Cancellation and Refund policy."],
                    ['Exchange', "You can ask for an exchange within 7 days of delivery if:\n• the item is damaged, defective or wrong, or\n• you would like a different design or size of the same or similar value (subject to stock).\nThe item must be unworn, unused and in its original packaging with all tags. Write to us on WhatsApp or e-mail with your order number; once we approve, we will arrange pick-up or ask you to send it back. If a different-value item is chosen, the difference is paid or refunded."],
                    ['What cannot be exchanged', "Worn or used items, items damaged after delivery, items without original packaging, and pieces made specially for you."],
                    ['Contact us', $contact],
                ],
            ],
        ];
    }

    public function up(): void
    {
        $now = now()->utc()->format('Y-m-d H:i:s');
        foreach ($this->pages() as $p) {
            array_walk_recursive($p, function (&$v) {
                if (is_string($v)) {
                    $v = Brand::fill($v);
                }
            });
            if (DB::table('pages')->where('kind', 'policy')->where('slug', $p['slug'])->exists()) {
                continue;
            }
            $blocks = [[
                'id' => (string) Str::uuid(), 'type' => 'text', 'eyebrow' => self::UPDATED, 'heading' => $p['title'], 'body' => $p['intro'], 'align' => 'left',
            ]];
            foreach ($p['sections'] as [$heading, $body]) {
                $blocks[] = ['id' => (string) Str::uuid(), 'type' => 'text', 'eyebrow' => '', 'heading' => $heading, 'body' => $body, 'align' => 'left'];
            }
            DB::table('pages')->insert([
                'id' => (string) Str::uuid(),
                'title' => $p['title'],
                'slug' => $p['slug'],
                'kind' => 'policy',
                'published' => 1,
                'blocks' => json_encode($blocks, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'seo_title' => $p['title'].' — {brand}',
                'seo_description' => $p['description'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('pages')->where('kind', 'policy')->whereIn('slug', array_column($this->pages(), 'slug'))->delete();
    }
};
