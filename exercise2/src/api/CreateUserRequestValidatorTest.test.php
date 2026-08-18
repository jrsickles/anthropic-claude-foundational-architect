<?php

declare(strict_types=1);

namespace Api\Tests;

use Api\CreateUserRequestValidator;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(CreateUserRequestValidator::class)]
final class CreateUserRequestValidatorTest extends TestCase
{
    public function test_returns_no_errors_for_valid_input(): void
    {
        $validator = new CreateUserRequestValidator();

        $errors = $validator->validate(['name' => 'Ada Lovelace', 'email' => 'ada@example.com']);

        $this->assertSame([], $errors);
    }

    public function test_returns_error_when_name_is_missing(): void
    {
        $validator = new CreateUserRequestValidator();

        $errors = $validator->validate(['email' => 'ada@example.com']);

        $this->assertSame(['The name field is required.'], $errors);
    }

    public function test_returns_error_when_email_is_invalid_format(): void
    {
        $validator = new CreateUserRequestValidator();

        $errors = $validator->validate(['name' => 'Ada Lovelace', 'email' => 'not-an-email']);

        $this->assertSame(['The email field must be a valid email address.'], $errors);
    }

    public function test_returns_multiple_errors_when_multiple_fields_invalid(): void
    {
        $validator = new CreateUserRequestValidator();

        $errors = $validator->validate([]);

        $this->assertSame(
            ['The name field is required.', 'The email field must be a valid email address.'],
            $errors,
        );
    }
}
