<?php

declare(strict_types=1);

namespace Api;

use Api\Support\ApiResponse;

/**
 * Handles read access to user resources for the API.
 */
final class UserController
{
    /**
     * @param UserRepositoryInterface $users The user data source.
     */
    public function __construct(private readonly UserRepositoryInterface $users)
    {
    }

    /**
     * Look up a single user by id.
     *
     * @param int $id The user id to look up.
     * @return ApiResponse A 200 envelope with the user data when found, or a
     *         404 error envelope when no matching user exists.
     */
    public function show(int $id): ApiResponse
    {
        $user = $this->users->find($id);

        if ($user === null) {
            return ApiResponse::error(
                'user_not_found',
                sprintf('User with id %d was not found.', $id),
                404,
            );
        }

        return ApiResponse::success($user);
    }
}
