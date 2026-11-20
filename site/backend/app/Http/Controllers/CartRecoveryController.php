<?php

namespace App\Http\Controllers;

use App\Support\AbandonedCarts;
use App\Support\CustomerAuth;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** The shopper's side of abandoned-cart recovery: keep the basket, refill it from an e-mail link, stop the reminders. */
class CartRecoveryController extends Controller
{
    /** Called by the checkout page once a valid e-mail is typed. Never reveals whether anything was stored. */
    public function capture(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'max:160'],
            'name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:30'],
            'items' => ['required', 'array', 'max:50'],
        ]);
        $customer = CustomerAuth::current($request);
        try {
            AbandonedCarts::capture($data['items'], $data['email'], $data['name'] ?? null, $data['phone'] ?? null, $customer->id ?? null);
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json(['ok' => true]);
    }

    /** The recovery link in an e-mail opens /cart?recover=<token>; the page asks for the basket here. */
    public function recover(string $token): JsonResponse
    {
        $cart = preg_match('/^[a-f0-9]{32}$/', $token) ? AbandonedCarts::recover($token) : null;
        if (! $cart) {
            return response()->json(['message' => 'This cart link is no longer valid.'], 404);
        }

        return response()->json($cart);
    }

    /** The link at the bottom of reminder e-mails. A plain page, because it is opened straight from an e-mail. */
    public function unsubscribe(string $token): Response
    {
        $ok = preg_match('/^[a-f0-9]{32}$/', $token) && AbandonedCarts::unsubscribe($token);
        $msg = $ok ? 'You will not get any more cart reminders from '.e(\App\Support\Brand::name()).'.' : 'This link is no longer valid.';

        return response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>'.e(\App\Support\Brand::name()).'</title>'
            .'<body style="font-family:Helvetica,Arial,sans-serif;background:#f6f2ee;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;">'
            .'<div style="background:#fff;border-radius:14px;padding:32px;max-width:420px;margin:16px;text-align:center;"><p style="font-family:Georgia,serif;font-size:24px;letter-spacing:.14em;margin:0 0 16px;">'.e(\App\Support\Brand::name()).'</p>'
            .'<p style="margin:0 0 20px;color:#333;line-height:1.6;">'.e($msg).'</p><a href="/" style="color:#111;">Back to the shop</a></div></body>', 200, ['Content-Type' => 'text/html; charset=utf-8']);
    }
}
