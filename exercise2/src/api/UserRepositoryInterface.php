<?php

declare(strict_types=1);

namespace Api;

/**
 * Provides read access to user records for the API layer.
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
}
