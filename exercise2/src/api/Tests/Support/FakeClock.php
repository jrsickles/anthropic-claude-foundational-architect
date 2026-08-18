<?php

declare(strict_types=1);

namespace Api\Tests\Support;

use Api\Support\ClockInterface;

/**
 * Test double for ClockInterface with a controllable, advanceable time.
 */
final class FakeClock implements ClockInterface
{
    /**
     * @param int $now The initial time, as a unix timestamp.
     */
    public function __construct(private int $now = 0)
    {
    }

    /**
     * @return int
     */
    public function now(): int
    {
        return $this->now;
    }

    /**
     * Move the clock forward.
     *
     * @param int $seconds Seconds to advance by.
     * @return void
     */
    public function advanceBy(int $seconds): void
    {
        $this->now += $seconds;
    }
}
