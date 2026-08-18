<?php

declare(strict_types=1);

namespace Api;

use Api\Support\RequestValidatorInterface;

/**
 * Validates the request data for creating a user.
 */
final class CreateUserRequestValidator implements RequestValidatorInterface
{
    /**
     * @param array<string, mixed> $data The raw request data to validate.
     * @return array<int, string> Validation error messages; empty when valid.
     */
    public function validate(array $data): array
    {
        $errors = [];

        if (!isset($data['name']) || !is_string($data['name']) || trim($data['name']) === '') {
            $errors[] = 'The name field is required.';
        }

        if (
            !isset($data['email'])
            || !is_string($data['email'])
            || filter_var($data['email'], FILTER_VALIDATE_EMAIL) === false
        ) {
            $errors[] = 'The email field must be a valid email address.';
        }

        return $errors;
    }
}
