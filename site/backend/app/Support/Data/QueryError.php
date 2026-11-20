<?php

namespace App\Support\Data;

/** A problem with the request itself; its message is safe to show to the caller. */
class QueryError extends \RuntimeException
{
}
