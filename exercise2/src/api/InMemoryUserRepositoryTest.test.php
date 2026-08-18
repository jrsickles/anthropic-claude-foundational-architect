<?php

declare(strict_types=1);

namespace Api\Tests;

use Api\InMemoryUserRepository;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(InMemoryUserRepository::class)]
final class InMemoryUserRepositoryTest extends TestCase
{
    public function test_create_assigns_auto_incrementing_id(): void
    {
        $repository = new InMemoryUserRepository();

        $created = $repository->create(['name' => 'Grace Hopper', 'email' => 'grace@example.com']);

        $this->assertSame(3, $created['id']);
    }

    public function test_create_stores_user_retrievable_via_find(): void
    {
        $repository = new InMemoryUserRepository();
        $created = $repository->create(['name' => 'Grace Hopper', 'email' => 'grace@example.com']);

        $found = $repository->find($created['id']);

        $this->assertSame($created, $found);
    }
}
