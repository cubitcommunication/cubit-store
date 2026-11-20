<?php

namespace App\Console\Commands;

use App\Support\AdminAuth;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Creates (or resets the password of) an admin account from the command line,
 * so the very first admin never has to be created through a public web form.
 *
 *   php artisan shop:create-admin you@example.com
 */
class ShopCreateAdmin extends Command
{
    protected $signature = 'shop:create-admin {email : Admin e-mail address} {--password= : Password (prompted when omitted; at least 10 characters)}';

    protected $description = 'Create an admin account, or reset the password of an existing one';

    public function handle(): int
    {
        $email = strtolower(trim((string) $this->argument('email')));
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Please provide a valid e-mail address.');

            return self::FAILURE;
        }

        $password = (string) ($this->option('password') ?: $this->secret('Password (min. 10 characters)'));
        if (strlen($password) < 10) {
            $this->error('The password must be at least 10 characters.');

            return self::FAILURE;
        }

        $now = now()->utc()->format('Y-m-d H:i:s');
        $existing = DB::table('admin_users')->where('email', $email)->first();
        if ($existing) {
            DB::table('admin_users')->where('id', $existing->id)->update(['password_hash' => AdminAuth::hashPassword($password), 'updated_at' => $now]);
            AdminAuth::endAllSessions($existing->id);
            $this->info("Password updated for {$email}. All sessions were signed out.");
        } else {
            DB::table('admin_users')->insert([
                'id' => (string) Str::uuid(), 'email' => $email, 'password_hash' => AdminAuth::hashPassword($password),
                'role' => AdminAuth::isSuperEmail($email) ? 'super' : 'admin', 'created_at' => $now, 'updated_at' => $now,
            ]);
            $this->info("Admin created: {$email}");
        }

        return self::SUCCESS;
    }
}
