<?php

namespace App\Http\Controllers;

use App\Support\AdminAuth;
use App\Support\Data\QueryEngine;
use App\Support\IntegrationGuard;
use App\Support\QueryLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Single entry point for database reads and writes from the React app.
 * The description arrives from the browser; the engine decides what is allowed.
 */
class QueryController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $descriptor = $request->json()->all();
        $admin = AdminAuth::current($request);
        // Integration settings (analytics IDs, reCAPTCHA key) may only be changed by the main administrator.
        if ($admin && ($admin['role'] ?? '') !== 'super' && IntegrationGuard::touches($descriptor)) {
            return response()->json(['data' => null, 'error' => ['message' => 'Only the main administrator can change integrations.'], 'count' => null]);
        }
        // Changes made by a signed-in admin go in the activity log (with the values from before the change).
        $before = $admin ? QueryLog::before($descriptor) : [];

        $result = (new QueryEngine($admin !== null))->execute($descriptor);

        if ($admin) {
            QueryLog::record($request, $admin, $descriptor, $before, $result);
        }

        return response()->json($result, 200, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
    }
}
