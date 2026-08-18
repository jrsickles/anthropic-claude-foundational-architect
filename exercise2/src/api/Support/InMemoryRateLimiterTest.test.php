<?php

declare(strict_types=1);

namespace Api\Tests\Support;

use Api\Support\InMemoryRateLimiter;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(InMemoryRateLimiter::class)]
final class InMemoryRateLimiterTest extends TestCase
{
    public function test_allows_attempt_within_limit(): void
    {
        $limiter = new InMemoryRateLimiter(new FakeClock(), maxAttempts: 2, windowSeconds: 60);

        $allowed = $limiter->attempt('client-1');

        $this->assertTrue($allowed);
    }

    public function test_blocks_attempt_once_limit_exceeded_within_window(): void
    {
        $limiter = new InMemoryRateLimiter(new FakeClock(), maxAttempts: 2, windowSeconds: 60);
        $limiter->attempt('client-1');
        $limiter->attempt('client-1');

        $allowed = $limiter->attempt('client-1');

        $this->assertFalse($allowed);
    }

    public function test_resets_count_after_window_elapses(): void
    {
        $clock = new FakeClock();
        $limiter = new InMemoryRateLimiter($clock, maxAttempts: 1, windowSeconds: 60);
        $limiter->attempt('client-1');
        $this->assertFalse($limiter->attempt('client-1'));

        $clock->advanceBy(60);
        $allowed = $limiter->attempt('client-1');

        $this->assertTrue($allowed);
    }

    public function test_tracks_limits_independently_per_key(): void
    {
        $limiter = new InMemoryRateLimiter(new FakeClock(), maxAttempts: 1, windowSeconds: 60);
        $limiter->attempt('client-1');

        $allowed = $limiter->attempt('client-2');

        $this->assertTrue($allowed);
    }
}
