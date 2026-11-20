<?php

namespace App\Http\Controllers;

use App\Support\StorefrontGate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The password page's two calls: is the shop locked for me, and unlock it. */
class StorefrontGateController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        $locked = ! StorefrontGate::allows($request);

        return response()->json(['locked' => $locked, 'message' => $locked ? StorefrontGate::message() : ''])->header('Cache-Control', 'no-store');
    }

    public function unlock(Request $request): JsonResponse
    {
        $password = (string) $request->json('password', '');
        if (! StorefrontGate::enabled() || StorefrontGate::check($password)) {
            return response()->json(['ok' => true])->withCookie(StorefrontGate::cookie($request));
        }

        return response()->json(['ok' => false, 'message' => 'That password is not right. Please try again.'], 422);
    }
}
