<?php

declare(strict_types=1);

namespace Api\Support;

/**
 * Validates incoming request data at the controller boundary.
 */
interface RequestValidatorInterface
{
    /**
     * @param array<string, mixed> $data The raw request data to validate.
     * @return array<int, string> Validation error messages; empty when valid.
     */
    public function validate(array $data): array;
}
