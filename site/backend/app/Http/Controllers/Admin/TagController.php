<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\Tags;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin -> Products -> Tags. Tags live on each product (products.tags); this lists them with counts and
 * renames, deletes or assigns a tag across many products at once. Admin only (RequireAdmin middleware).
 */
class TagController extends Controller
{
    /** Every tag in use with how many products carry it (case-insensitive, shown as first spelled). */
    public function index(): JsonResponse
    {
        $counts = [];
        $names = [];
        foreach (DB::table('products')->whereNull('archived_at')->pluck('tags') as $stored) {
            foreach (Tags::decode($stored) as $tag) {
                $key = mb_strtolower($tag);
                $names[$key] ??= $tag;
                $counts[$key] = ($counts[$key] ?? 0) + 1;
            }
        }
        $rows = [];
        foreach ($counts as $key => $count) {
            $rows[] = ['tag' => $names[$key], 'count' => $count];
        }
        usort($rows, static fn (array $a, array $b): int => strcasecmp($a['tag'], $b['tag']));

        return response()->json(['tags' => $rows]);
    }

    /** Ids of the products that carry a tag (for the "add or remove products" window). */
    public function products(Request $request): JsonResponse
    {
        $tag = Tags::one($request->query('tag'));
        $ids = [];
        if ($tag !== null) {
            foreach (DB::table('products')->whereNull('archived_at')->get(['id', 'tags']) as $p) {
                if (Tags::has(Tags::decode($p->tags), $tag)) {
                    $ids[] = $p->id;
                }
            }
        }

        return response()->json(['ids' => $ids]);
    }

    public function rename(Request $request): JsonResponse
    {
        $data = $request->validate(['from' => ['required', 'string', 'max:60'], 'to' => ['required', 'string', 'max:60']]);
        $from = Tags::one($data['from']);
        $to = Tags::one($data['to']);
        if ($from === null || $to === null) {
            return response()->json(['message' => 'Please enter a tag name.'], 422);
        }

        $changed = $this->mutate($from, static fn (array $tags): array => array_map(
            static fn (string $t): string => mb_strtolower($t) === mb_strtolower($from) ? $to : $t,
            $tags,
        ));

        return response()->json(['changed' => $changed]);
    }

    public function delete(Request $request): JsonResponse
    {
        $data = $request->validate(['tag' => ['required', 'string', 'max:60']]);
        $tag = Tags::one($data['tag']);
        if ($tag === null) {
            return response()->json(['message' => 'Please choose a tag.'], 422);
        }

        $changed = $this->mutate($tag, static fn (array $tags): array => array_values(array_filter(
            $tags,
            static fn (string $t): bool => mb_strtolower($t) !== mb_strtolower($tag),
        )));

        return response()->json(['changed' => $changed]);
    }

    /** Adds a tag to, or removes it from, the chosen products. */
    public function assign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tag' => ['required', 'string', 'max:60'],
            'mode' => ['required', 'in:add,remove'],
            'ids' => ['required', 'array', 'min:1', 'max:1000'],
            'ids.*' => ['string', 'max:64'],
        ]);
        $tag = Tags::one($data['tag']);
        if ($tag === null) {
            return response()->json(['message' => 'Please enter a tag name.'], 422);
        }

        $changed = 0;
        DB::transaction(function () use ($data, $tag, &$changed): void {
            foreach (DB::table('products')->whereIn('id', $data['ids'])->get(['id', 'tags']) as $p) {
                $tags = Tags::decode($p->tags);
                $has = Tags::has($tags, $tag);
                if ($data['mode'] === 'add' && ! $has) {
                    $tags[] = $tag;
                } elseif ($data['mode'] === 'remove' && $has) {
                    $tags = array_values(array_filter($tags, static fn (string $t): bool => mb_strtolower($t) !== mb_strtolower($tag)));
                } else {
                    continue;
                }
                DB::table('products')->where('id', $p->id)->update(['tags' => Tags::encode($tags), 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
                $changed++;
            }
        });

        return response()->json(['changed' => $changed]);
    }

    /** Rewrites the tags of every product that carries `$needle`. */
    private function mutate(string $needle, callable $fn): int
    {
        $changed = 0;
        DB::transaction(function () use ($fn, $needle, &$changed): void {
            foreach (DB::table('products')->get(['id', 'tags']) as $p) {
                $tags = Tags::decode($p->tags);
                if (! Tags::has($tags, $needle)) {
                    continue;
                }
                DB::table('products')->where('id', $p->id)->update(['tags' => Tags::encode($fn($tags)), 'updated_at' => now()->utc()->format('Y-m-d H:i:s')]);
                $changed++;
            }
        });

        return $changed;
    }
}
