<?php

declare(strict_types=1);

namespace Api\Support;

/**
 * Fixed-window RateLimiterInterface implementation holding counts in memory.
 * State is per-process and does not persist across requests; intended for
 * tests and local development. A production deployment would swap in a
 * persistent (e.g. Redis-backed) implementation via RateLimiterInterface.
 */
final class InMemoryRateLimiter implements RateLimiterInterface
{
    /** @var array<string, array{count: int, windowStart: int}> */
    private array $state = [];

    /**
     * @param ClockInterface $clock The clock used to track window boundaries.
     * @param int $maxAttempts Maximum attempts allowed per key per window.
     * @param int $windowSeconds Length of the rate limit window, in seconds.
     */
    public function __construct(
        private readonly ClockInterface $clock,
        private readonly int $maxAttempts = 5,
        private readonly int $windowSeconds = 60,
    ) {
    }

    /**
     * @param string $key Identifies the caller being rate-limited.
     * @return bool True if the attempt is within the allowed rate.
     */
    public function attempt(string $key): bool
    {
        $now = $this->clock->now();
        $entry = $this->state[$key] ?? ['count' => 0, 'windowStart' => $now];

        if ($now - $entry['windowStart'] >= $this->windowSeconds) {
            $entry = ['count' => 0, 'windowStart' => $now];
        }

        $entry['count']++;
        $this->state[$key] = $entry;

        return $entry['count'] <= $this->maxAttempts;
    }
}
