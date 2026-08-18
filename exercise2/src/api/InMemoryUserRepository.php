<?php

declare(strict_types=1);

namespace Api;

/**
 * In-memory UserRepositoryInterface implementation seeded with fixed data.
 * Intended for tests and local development only.
 */
final class InMemoryUserRepository implements UserRepositoryInterface
{
    /**
     * @param array<int, array<string, mixed>> $users Users keyed by id.
     */
    public function __construct(private readonly array $users = [
        1 => ['id' => 1, 'name' => 'Ada Lovelace', 'email' => 'ada@example.com'],
        2 => ['id' => 2, 'name' => 'Alan Turing', 'email' => 'alan@example.com'],
    ]) {
    }

    /**
     * @param int $id The user id to look up.
     * @return array<string, mixed>|null The user record, or null if not found.
     */
    public function find(int $id): ?array
    {
        return $this->users[$id] ?? null;
    }
}
