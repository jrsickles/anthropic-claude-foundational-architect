<?php

declare(strict_types=1);

namespace Api;

/**
 * In-memory UserRepositoryInterface implementation seeded with fixed data.
 * Intended for tests and local development only.
 */
final class InMemoryUserRepository implements UserRepositoryInterface
{
    private int $nextId;

    /**
     * @param array<int, array<string, mixed>> $users Users keyed by id.
     */
    public function __construct(private array $users = [
        1 => ['id' => 1, 'name' => 'Ada Lovelace', 'email' => 'ada@example.com'],
        2 => ['id' => 2, 'name' => 'Alan Turing', 'email' => 'alan@example.com'],
    ]) {
        $this->nextId = $this->users === [] ? 1 : max(array_keys($this->users)) + 1;
    }

    /**
     * @param int $id The user id to look up.
     * @return array<string, mixed>|null The user record, or null if not found.
     */
    public function find(int $id): ?array
    {
        return $this->users[$id] ?? null;
    }

    /**
     * @param array{name: string, email: string} $data The user data to store.
     * @return array<string, mixed> The created user record, including its id.
     */
    public function create(array $data): array
    {
        $id = $this->nextId++;
        $user = ['id' => $id, 'name' => $data['name'], 'email' => $data['email']];
        $this->users[$id] = $user;

        return $user;
    }
}
