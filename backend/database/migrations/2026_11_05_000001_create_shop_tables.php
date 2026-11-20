<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Your Store schema for MySQL / MariaDB (Hostinger).
 *
 * Mirrors the previous Cloudflare D1 schema one-to-one so every id, slug, SKU
 * and image reference survives the move. UUID strings stay as CHAR(36); JSON
 * values (occasion, specifications) are stored as TEXT because that behaves
 * identically on MySQL and MariaDB.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('products', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('name');
            $t->string('slug', 191)->unique();
            $t->string('sku', 100)->index();
            $t->decimal('price', 12, 2)->default(0);
            $t->text('description')->nullable();
            $t->string('material', 100)->default('');
            $t->string('category', 100)->default('');
            $t->string('subcategory', 150)->nullable();
            $t->text('occasion');
            $t->string('where_to_wear', 255)->nullable();
            $t->text('specifications');
            $t->boolean('featured')->default(false);
            $t->boolean('new_arrival')->default(false);
            $t->boolean('navratri_2026')->default(false);
            $t->boolean('diwali_2026')->default(false);
            $t->boolean('published')->default(true);
            $t->dateTime('archived_at')->nullable();
            $t->string('seo_title')->nullable();
            $t->text('seo_description')->nullable();
            $t->string('seo_image_url', 500)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index(['published', 'archived_at'], 'products_public_idx');
            $t->index('updated_at', 'products_updated_idx');
        });

        Schema::create('product_images', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('product_id', 36);
            $t->string('image_url', 500);
            $t->string('alt_text', 500)->nullable();
            $t->integer('sort_order')->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('product_id')->references('id')->on('products')->cascadeOnDelete();
            $t->index(['product_id', 'sort_order'], 'product_images_product_idx');
        });

        Schema::create('categories', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('name');
            $t->string('slug', 191);
            $t->char('parent_id', 36)->nullable();
            $t->text('description')->nullable();
            $t->string('image', 500)->nullable();
            $t->integer('sort_order')->default(0);
            $t->boolean('published')->default(true);
            $t->string('seo_title')->nullable();
            $t->text('seo_description')->nullable();
            $t->string('seo_image_url', 500)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index('slug');
        });

        Schema::create('collections', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('name');
            $t->string('slug', 191);
            $t->text('description')->nullable();
            $t->string('image', 500)->nullable();
            $t->string('group_name')->nullable();
            $t->string('category_filter')->nullable();
            $t->string('material_filter')->nullable();
            $t->boolean('navratri_only')->default(false);
            $t->integer('sort_order')->default(0);
            $t->boolean('published')->default(true);
            $t->string('seo_title')->nullable();
            $t->text('seo_description')->nullable();
            $t->string('seo_image_url', 500)->nullable();
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
            $t->index('slug');
        });

        Schema::create('site_settings', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('key', 150)->unique();
            $t->text('value');
            $t->string('group_name', 100)->default('homepage');
            $t->string('label');
            $t->text('help')->nullable();
            $t->boolean('multiline')->default(false);
            $t->integer('sort_order')->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });

        Schema::create('site_nav', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('label');
            $t->string('path', 500);
            $t->integer('sort_order')->default(0);
            $t->boolean('visible')->default(true);
            $t->boolean('system')->default(false);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });

        Schema::create('site_media', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('key', 150)->unique();
            $t->string('title');
            $t->text('description')->nullable();
            $t->string('image_url', 500)->nullable();
            $t->string('mobile_image_url', 500)->nullable();
            $t->string('alt_text', 500)->default('');
            $t->boolean('active')->default(true);
            $t->integer('sort_order')->default(0);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });

        Schema::create('site_media_versions', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('media_id', 36);
            $t->string('image_url', 500)->nullable();
            $t->string('mobile_image_url', 500)->nullable();
            $t->string('alt_text', 500)->default('');
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('media_id')->references('id')->on('site_media')->cascadeOnDelete();
            $t->index(['media_id', 'created_at'], 'site_media_versions_media_idx');
        });

        Schema::create('slug_redirects', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('entity_type', 50);
            $t->string('source_slug', 191);
            $t->string('target_slug', 191);
            $t->string('source_path', 191)->unique();
            $t->string('target_path', 500);
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });

        // Admin accounts: passwords are stored only as salted hashes.
        Schema::create('admin_users', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->string('email', 191)->unique();
            $t->string('password_hash');
            $t->string('role', 50)->default('admin');
            $t->dateTime('created_at')->useCurrent();
            $t->dateTime('updated_at')->useCurrent();
        });

        // One row per signed-in browser. Only a SHA-256 hash of the cookie value
        // is stored, so a database dump cannot be replayed as a login.
        Schema::create('admin_sessions', function (Blueprint $t) {
            $t->char('id', 36)->primary();
            $t->char('admin_id', 36);
            $t->char('token_hash', 64)->unique();
            $t->dateTime('expires_at');
            $t->dateTime('created_at')->useCurrent();
            $t->foreign('admin_id')->references('id')->on('admin_users')->cascadeOnDelete();
            $t->index('admin_id', 'admin_sessions_admin_idx');
        });
    }

    public function down(): void
    {
        foreach ([
            'admin_sessions', 'admin_users', 'slug_redirects', 'site_media_versions', 'site_media',
            'site_nav', 'site_settings', 'collections', 'categories', 'product_images', 'products',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
