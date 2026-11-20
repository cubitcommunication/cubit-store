<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Reel video uploads (multipart: the files are too big for the base64 image endpoint).
 * Only a signed-in admin reaches this (RequireAdmin middleware).
 */
class ReelController extends Controller
{
    public function upload(Request $request): JsonResponse
    {
        $max = (int) config('shop.max_video_bytes');
        $request->validate(['video' => ['required', 'file']], ['video.required' => 'Choose a video file.', 'video.file' => 'The upload did not finish. The file may be larger than the server allows.']);

        $file = $request->file('video');
        if (! $file || ! $file->isValid()) {
            return response()->json(['message' => 'The upload did not finish. The file may be larger than the server allows ('.ini_get('upload_max_filesize').').'], 422);
        }
        if ($file->getSize() > $max) {
            return response()->json(['message' => 'That video is larger than '.round($max / 1048576).' MB. Please compress it or trim it.'], 422);
        }

        $head = (string) file_get_contents($file->getRealPath(), false, null, 0, 16);
        $ext = Media::videoExtension($head);
        if ($ext === null) {
            return response()->json(['message' => 'Please upload an MP4 or WebM video.'], 422);
        }

        // Reels and product videos are kept in their own folders.
        $folder = $request->input('folder') === 'products' ? 'products' : 'reels';
        $key = Media::withMonth($folder.'/'.Str::uuid().'.'.$ext);
        try {
            Media::putFile($key, $file->getRealPath());
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['url' => Media::URL_PREFIX.$key]);
    }
}
