<?php

declare(strict_types=1);

namespace Api\Support;

/**
 * ClockInterface backed by the system clock.
 */
final class SystemClock implements ClockInterface
{
    /**
     * @return int
     */
    public function now(): int
    {
        return time();
    }
}
