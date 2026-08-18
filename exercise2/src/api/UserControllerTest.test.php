<?php

declare(strict_types=1);

namespace Api\Tests;

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
        $controller = new UserController($repository);

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
        $controller = new UserController($repository);

        $response = $controller->show(1);

        $this->assertSame(200, $response->statusCode());
        $this->assertSame(['data' => $user, 'error' => null], $response->toArray());
    }
}
