<?php

declare(strict_types=1);

namespace Api;

use Api\Support\ApiResponse;
use Api\Support\RateLimiterInterface;
use Api\Support\RequestValidatorInterface;

/**
 * Handles read and write access to user resources for the API.
 */
final class UserController
{
    /**
     * @param UserRepositoryInterface $users The user data source.
     * @param RateLimiterInterface $rateLimiter Limits write attempts per caller.
     * @param RequestValidatorInterface $validator Validates incoming write requests.
     */
    public function __construct(
        private readonly UserRepositoryInterface $users,
        private readonly RateLimiterInterface $rateLimiter,
        private readonly RequestValidatorInterface $validator,
    ) {
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

    /**
     * Create a new user.
     *
     * @param array<string, mixed> $data The request data for the new user.
     * @param string $clientKey Identifies the caller for rate-limiting
     *        purposes, e.g. a client IP address or API key.
     * @return ApiResponse A 201 envelope with the created user, a 429 error
     *         envelope when the caller has exceeded the rate limit, or a 400
     *         error envelope when the request data fails validation.
     */
    public function store(array $data, string $clientKey): ApiResponse
    {
        if (!$this->rateLimiter->attempt($clientKey)) {
            return ApiResponse::error(
                'rate_limit_exceeded',
                'Too many requests. Please try again later.',
                429,
            );
        }

        $errors = $this->validator->validate($data);

        if ($errors !== []) {
            return ApiResponse::error('validation_failed', implode(' ', $errors), 400);
        }

        return ApiResponse::success($this->users->create($data), 201);
    }
}
