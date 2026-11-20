// Post-build step.
//
// 1. Vite writes dist/index.html. The server must never serve that file directly
//    (Laravel renders it per request so product pages get real <title>/OG tags),
//    so it is renamed to app.html, which the SPA controller reads.
// 2. With --copy, the finished build is also copied into ../backend/public so
//    `php artisan serve` (or XAMPP) can serve the whole site locally.
import { cpSync, existsSync, renameSync } from "node:fs";

if (existsSync("dist/index.html")) {
  renameSync("dist/index.html", "dist/app.html");
  console.log("dist/index.html -> dist/app.html");
}

if (process.argv.includes("--copy")) {
  cpSync("dist", "../backend/public", { recursive: true });
  console.log("dist/ -> ../backend/public/");
}
