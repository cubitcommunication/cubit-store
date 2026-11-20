<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Features;
use Illuminate\Http\JsonResponse;

/** Tells the admin panel which paid add-ons are on, so it can show or hide their screens. */
class FeaturesController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(['features' => Features::all()]);
    }
}
