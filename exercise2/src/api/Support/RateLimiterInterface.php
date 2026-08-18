<?php

declare(strict_types=1);

namespace Api\Support;

/**
 * Limits how often a given caller may perform a rate-limited action.
 */
interface RateLimiterInterface
{
    /**
     * Record an attempt for the given key and report whether it is within
     * the allowed rate.
     *
     * @param string $key Identifies the caller being rate-limited, e.g. a
     *        client IP address or API key.
     * @return bool True if the attempt is within the allowed rate, false if
     *        the caller has exceeded it.
     */
    public function attempt(string $key): bool;
}
