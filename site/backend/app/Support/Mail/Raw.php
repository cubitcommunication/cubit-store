<?php

namespace App\Support\Mail;

/** A piece of ready-made HTML for an e-mail token (a table, a button). Everything else is escaped. */
final class Raw
{
    public function __construct(public readonly string $html)
    {
    }
}
