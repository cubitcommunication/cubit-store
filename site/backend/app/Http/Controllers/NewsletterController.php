<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Footer "Subscribe to our updates" form. Stores the address once; never reveals whether it was already subscribed. */
class NewsletterController extends Controller
{
    public function subscribe(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email:rfc', 'max:160']], ['email.email' => 'Please enter a valid e-mail address.']);

        $added = DB::table('newsletter_subscribers')->insertOrIgnore([
            'id' => (string) Str::uuid(),
            'email' => strtolower(trim($data['email'])),
            'created_at' => now()->utc()->format('Y-m-d H:i:s'),
        ]);
        if ($added) {
            \App\Support\Notifier::send('new_subscriber', 'New newsletter subscriber', strtolower(trim($data['email'])), '/admin/subscribers');
        }

        return response()->json(['ok' => true]);
    }
}
