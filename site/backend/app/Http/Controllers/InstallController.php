<?php

namespace App\Http\Controllers;

use App\Support\Installer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * The browser installer's two calls. Both answer 404 once the site has its .env, so on a finished site this does not exist.
 */
class InstallController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        if (! Installer::needed()) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return response()->json([
            'needed' => true,
            'requirements' => Installer::requirements(),
            'siteUrl' => $request->getSchemeAndHttpHost(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! Installer::needed()) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $v = Validator::make($request->all(), [
            'siteName' => ['required', 'string', 'max:80'],
            'siteUrl' => ['required', 'url:http,https', 'max:200'],
            'tagline' => ['nullable', 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:30', 'regex:/^[0-9+()\s-]*$/'],
            'supportEmail' => ['nullable', 'email', 'max:120'],
            'dbName' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_$-]+$/'],
            'dbUser' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_$.@-]+$/'],
            'dbPassword' => ['required', 'string', 'max:200'],
            'adminEmail' => ['required', 'email', 'max:120'],
            'adminPassword' => ['required', 'string', 'min:10', 'max:200'],
        ], [
            'dbName.regex' => 'The database name may only contain letters, numbers and underscores.',
            'dbUser.regex' => 'The database user may only contain letters, numbers and underscores.',
            'adminPassword.min' => 'The password must be at least 10 characters.',
            'phone.regex' => 'Use digits, spaces and a leading + only.',
        ]);
        if ($v->fails()) {
            return response()->json(['message' => (string) $v->errors()->first(), 'errors' => $v->errors()], 422);
        }

        try {
            $result = Installer::install($v->validated());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['ok' => true, 'existing' => $result['existing']]);
    }
}
