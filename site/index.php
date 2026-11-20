<?php

use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

/*
| Where is the Laravel application?
|
|  - On Hostinger the web root (public_html) holds only this folder's contents and
|    the application lives next to it, outside the web root, in "shop-app".
|  - On a developer machine this file sits in backend/public, so the application
|    is simply the parent folder.
*/
$appPath = __DIR__.'/..';
foreach ([
    __DIR__.'/backend',             // app inside the web folder (blocked from the web by backend/.htaccess). First on purpose:
                                    // a copy of the repository next to it (public_html/backend) must never win over site/backend.
    __DIR__.'/../shop-app',      // app next to the web folder
    __DIR__.'/../../shop-app',   // app above public_html/<name>/
    __DIR__.'/../backend',          // web folder = <site>/frontend, app = <site>/backend
] as $candidate) {
    if (is_file($candidate.'/vendor/autoload.php')) {
        $appPath = $candidate;
        break;
    }
}

/*
| Hostinger's Git copies the whole repository, so the built site lives in <web root>/site and the repository's root
| .htaccess hands every request to it. Apache then reports addresses as /site/shop; the app must see /shop.
*/
if (isset($_SERVER['REQUEST_URI']) && preg_match('#^/site(?=/|\?|$)#', $_SERVER['REQUEST_URI'])) {
    $_SERVER['REQUEST_URI'] = substr($_SERVER['REQUEST_URI'], 5);
    if ($_SERVER['REQUEST_URI'] === '' || $_SERVER['REQUEST_URI'][0] === '?') {
        $_SERVER['REQUEST_URI'] = '/'.$_SERVER['REQUEST_URI'];
    }
    $_SERVER['SCRIPT_NAME'] = '/index.php';
    $_SERVER['PHP_SELF'] = '/index.php';
}

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = $appPath.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require $appPath.'/vendor/autoload.php';

// Bootstrap Laravel and handle the request...
$app = require_once $appPath.'/bootstrap/app.php';
$app->usePublicPath(__DIR__);

$app->handleRequest(Request::capture());
