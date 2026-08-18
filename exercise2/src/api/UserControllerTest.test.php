<?php

declare(strict_types=1);

namespace Api\Tests;

use Api\Support\RateLimiterInterface;
use Api\Support\RequestValidatorInterface;
use Api\UserController;
use Api\UserRepositoryInterface;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(UserController::class)]
final class UserControllerTest extends TestCase
{
    public function test_returns_404_when_user_not_found(): void
    {
        $repository = $this->createMock(UserRepositoryInterface::class);
        $repository->method('find')->with(999)->willReturn(null);
        $controller = new UserController(
            $repository,
            $this->createMock(RateLimiterInterface::class),
            $this->createMock(RequestValidatorInterface::class),
        );

        $response = $controller->show(999);

        $this->assertSame(404, $response->statusCode());
        $this->assertSame(
            ['data' => null, 'error' => ['code' => 'user_not_found', 'message' => 'User with id 999 was not found.']],
            $response->toArray(),
        );
    }

    public function test_returns_200_with_user_data_when_found(): void
    {
        $user = ['id' => 1, 'name' => 'Ada Lovelace'];
        $repository = $this->createMock(UserRepositoryInterface::class);
        $repository->method('find')->with(1)->willReturn($user);
        $controller = new UserController(
            $repository,
            $this->createMock(RateLimiterInterface::class),
            $this->createMock(RequestValidatorInterface::class),
        );

        $response = $controller->show(1);

        $this->assertSame(200, $response->statusCode());
        $this->assertSame(['data' => $user, 'error' => null], $response->toArray());
    }

    public function test_returns_429_when_rate_limit_exceeded_on_store(): void
    {
        $rateLimiter = $this->createMock(RateLimiterInterface::class);
        $rateLimiter->method('attempt')->with('client-1')->willReturn(false);
        $controller = new UserController(
            $this->createMock(UserRepositoryInterface::class),
            $rateLimiter,
            $this->createMock(RequestValidatorInterface::class),
        );

        $response = $controller->store(['name' => 'Ada Lovelace', 'email' => 'ada@example.com'], 'client-1');

        $this->assertSame(429, $response->statusCode());
        $this->assertSame(
            ['data' => null, 'error' => ['code' => 'rate_limit_exceeded', 'message' => 'Too many requests. Please try again later.']],
            $response->toArray(),
        );
    }

    public function test_returns_400_when_validation_fails_on_store(): void
    {
        $rateLimiter = $this->createMock(RateLimiterInterface::class);
        $rateLimiter->method('attempt')->willReturn(true);
        $validator = $this->createMock(RequestValidatorInterface::class);
        $validator->method('validate')->willReturn(['The name field is required.']);
        $controller = new UserController(
            $this->createMock(UserRepositoryInterface::class),
            $rateLimiter,
            $validator,
        );

        $response = $controller->store(['email' => 'ada@example.com'], 'client-1');

        $this->assertSame(400, $response->statusCode());
        $this->assertSame(
            ['data' => null, 'error' => ['code' => 'validation_failed', 'message' => 'The name field is required.']],
            $response->toArray(),
        );
    }

    public function test_returns_201_with_created_user_when_store_succeeds(): void
    {
        $input = ['name' => 'Ada Lovelace', 'email' => 'ada@example.com'];
        $created = ['id' => 1, 'name' => 'Ada Lovelace', 'email' => 'ada@example.com'];
        $rateLimiter = $this->createMock(RateLimiterInterface::class);
        $rateLimiter->method('attempt')->willReturn(true);
        $validator = $this->createMock(RequestValidatorInterface::class);
        $validator->method('validate')->willReturn([]);
        $repository = $this->createMock(UserRepositoryInterface::class);
        $repository->method('create')->with($input)->willReturn($created);
        $controller = new UserController($repository, $rateLimiter, $validator);

        $response = $controller->store($input, 'client-1');

        $this->assertSame(201, $response->statusCode());
        $this->assertSame(['data' => $created, 'error' => null], $response->toArray());
    }
}
