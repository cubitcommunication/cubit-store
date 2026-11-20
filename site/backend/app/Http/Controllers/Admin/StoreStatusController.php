<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Mail\SmtpAccounts;
use App\Support\Secrets;
use Illuminate\Http\JsonResponse;

/** Tells the Store features screen which server-side pieces are set up (never reveals any secret). */
class StoreStatusController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json([
            'razorpayConfigured' => Secrets::razorpay()['key_id'] !== '' && Secrets::razorpay()['key_secret'] !== '',
            'mailConfigured' => SmtpAccounts::configured(),
            'orderNotifyEmail' => config('shop.order_notify') ?: null,
        ]);
    }
}
