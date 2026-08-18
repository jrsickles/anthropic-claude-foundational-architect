<?php

declare(strict_types=1);

namespace Api;

/**
 * Provides read and write access to user records for the API layer.
 */
interface UserRepositoryInterface
{
    /**
     * Find a user by id.
     *
     * @param int $id The user id to look up.
     * @return array<string, mixed>|null The user record, or null if not found.
     */
    public function find(int $id): ?array;

    /**
     * Create a new user.
     *
     * @param array{name: string, email: string} $data The user data to store.
     * @return array<string, mixed> The created user record, including its id.
     */
    public function create(array $data): array;
}
