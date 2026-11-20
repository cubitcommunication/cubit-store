<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Bulk\BulkService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Admin-only bulk product endpoints (CSV export, preview and import). */
class BulkController extends Controller
{
    private const MAX_CSV_BYTES = 2 * 1024 * 1024;

    public function export(Request $request, BulkService $bulk): JsonResponse
    {
        $id = $request->input('id');

        return response()->json(['csv' => $bulk->buildProductCsv(is_string($id) ? $id : null)]);
    }

    public function preview(Request $request, BulkService $bulk): JsonResponse
    {
        return response()->json($bulk->previewImport($this->csv($request), $this->mode($request)));
    }

    public function commit(Request $request, BulkService $bulk): JsonResponse
    {
        $mode = $this->mode($request);
        if ($mode === 'update' && $request->input('confirmUpdates') !== true) {
            return response()->json(['message' => 'Updating existing products needs an explicit confirmation.'], 422);
        }

        try {
            return response()->json($bulk->runImport($this->csv($request), $mode));
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function csv(Request $request): string
    {
        $csv = $request->input('csv');
        if (! is_string($csv) || trim($csv) === '') {
            abort(response()->json(['message' => 'No CSV data received.'], 422));
        }
        if (strlen($csv) > self::MAX_CSV_BYTES) {
            abort(response()->json(['message' => 'That file is too large (max 2 MB).'], 422));
        }

        return $csv;
    }

    private function mode(Request $request): string
    {
        return $request->input('mode') === 'update' ? 'update' : 'create';
    }
}
