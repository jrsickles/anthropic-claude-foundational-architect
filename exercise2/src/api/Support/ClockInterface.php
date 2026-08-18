<?php

declare(strict_types=1);

namespace Api\Support;

/**
 * Provides the current time, abstracted so callers can be tested without
 * relying on real time passing.
 */
interface ClockInterface
{
    /**
     * The current time as a unix timestamp, in seconds.
     *
     * @return int
     */
    public function now(): int;
}
