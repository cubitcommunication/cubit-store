<?php

namespace App\Http\Controllers;

use App\Support\Seo;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Product feed for Google Merchant Center and Meta (Facebook / Instagram) catalogues: an RSS 2.0 file with the g: fields
 * both accept. Only published, non-archived pieces with a price are listed; each variation is its own item.
 */
class ProductFeedController extends Controller
{
    private function esc(?string $v): string
    {
        return htmlspecialchars((string) $v, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function image(?string $url): string
    {
        $url = (string) $url;

        return preg_match('#^https?://#i', $url) ? $url : Seo::absoluteUrl($url ?: '/');
    }

    public function __invoke(): Response
    {
        $products = DB::table('products')->where('published', 1)->whereNull('archived_at')->where('price', '>', 0)->orderBy('name')->get();
        $images = DB::table('product_images')->whereIn('product_id', $products->pluck('id'))->orderBy('sort_order')->get(['product_id', 'image_url'])->groupBy('product_id');
        $variants = DB::table('product_variants')->whereIn('product_id', $products->pluck('id'))->orderBy('sort_order')->get()->groupBy('product_id');

        $xml = '<?xml version="1.0" encoding="UTF-8"?>'."\n".'<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>'."\n";
        $xml .= '<title>'.$this->esc(\App\Support\Brand::name()).'</title><link>'.$this->esc(Seo::siteUrl()).'</link><description>'.$this->esc(\App\Support\Brand::name()).'</description>'."\n";

        foreach ($products as $p) {
            $pics = $images->get($p->id, collect());
            $entries = $variants->get($p->id);
            $list = $entries && $entries->isNotEmpty()
                ? $entries->map(fn ($v) => ['id' => $v->sku ?: $p->id.'-'.$v->id, 'title' => $p->name.' - '.$v->title, 'price' => $v->price ?? $p->price, 'stock' => $v->stock_quantity, 'image' => $v->image_url ?: optional($pics->first())->image_url, 'group' => $p->sku ?: $p->id])->all()
                : [['id' => $p->sku ?: $p->id, 'title' => $p->name, 'price' => $p->price, 'stock' => $p->stock_quantity, 'image' => optional($pics->first())->image_url, 'group' => null]];
            $desc = trim(preg_replace('/\s+/', ' ', strip_tags((string) $p->description)) ?? '') ?: $p->name;

            foreach ($list as $e) {
                if (! $e['image']) {
                    continue;   // both services reject items without a picture
                }
                $available = $e['stock'] === null || (int) $e['stock'] > 0;
                $xml .= "<item>\n"
                    .'<g:id>'.$this->esc((string) $e['id'])."</g:id>\n"
                    .'<g:title>'.$this->esc(mb_substr($e['title'], 0, 150))."</g:title>\n"
                    .'<g:description>'.$this->esc(mb_substr($desc, 0, 4900))."</g:description>\n"
                    .'<g:link>'.$this->esc(Seo::absoluteUrl('/product/'.rawurlencode($p->slug)))."</g:link>\n"
                    .'<g:image_link>'.$this->esc($this->image($e['image']))."</g:image_link>\n"
                    .'<g:availability>'.($available ? 'in stock' : 'out of stock')."</g:availability>\n"
                    .'<g:price>'.number_format((float) $e['price'], 2, '.', '').' INR</g:price>'."\n"
                    ."<g:condition>new</g:condition>\n<g:brand>".$this->esc(\App\Support\Brand::name())."</g:brand>\n"
                    .($p->category ? '<g:product_type>'.$this->esc($p->category)."</g:product_type>\n" : '')
                    .($e['group'] ? '<g:item_group_id>'.$this->esc((string) $e['group'])."</g:item_group_id>\n" : '')
                    ."<g:identifier_exists>no</g:identifier_exists>\n</item>\n";
            }
        }
        $xml .= "</channel></rss>\n";

        return response($xml, 200, ['Content-Type' => 'application/xml; charset=UTF-8', 'Cache-Control' => 'public, max-age=900']);
    }
}
