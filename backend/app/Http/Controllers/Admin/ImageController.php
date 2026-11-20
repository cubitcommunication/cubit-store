<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Image writes. Only a signed-in admin may upload or delete (RequireAdmin
 * middleware); the browser sends the already-resized image as base64.
 */
class ImageController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string', 'max:220'],
            'data' => ['required', 'string'],
            'contentType' => ['nullable', 'string', 'max:100'],
        ]);

        if (! Media::isSafeKey($data['path'])) {
            return response()->json(['message' => 'Invalid image path.'], 422);
        }
        $path = Media::withMonth($data['path']);
        $bytes = base64_decode($data['data'], true);
        if ($bytes === false) {
            return response()->json(['message' => 'Invalid image upload.'], 422);
        }

        try {
            Media::put($path, $bytes);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['path' => $path]);
    }

    public function destroy(Request $request): JsonResponse
    {
        $data = $request->validate(['path' => ['required', 'string', 'max:220']]);
        if (! Media::isSafeKey($data['path'])) {
            return response()->json(['message' => 'Invalid image path.'], 422);
        }
        Media::delete($data['path']);

        return response()->json(['ok' => true]);
    }

    public function destroyIfUnreferenced(Request $request): JsonResponse
    {
        $data = $request->validate(['url' => ['required', 'string', 'max:500']]);
        if (! str_starts_with($data['url'], Media::URL_PREFIX)) {
            return response()->json(['message' => 'Invalid image URL.'], 422);
        }

        return response()->json(['deleted' => Media::deleteIfUnreferenced($data['url'])]);
    }
}
