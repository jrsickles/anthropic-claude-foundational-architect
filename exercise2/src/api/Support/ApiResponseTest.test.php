<?php

declare(strict_types=1);

namespace Api\Tests\Support;

use Api\Support\ApiResponse;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(ApiResponse::class)]
final class ApiResponseTest extends TestCase
{
    public function test_success_envelope_wraps_data_with_null_error(): void
    {
        $data = ['id' => 1, 'name' => 'Ada Lovelace'];

        $response = ApiResponse::success($data);

        $this->assertSame(200, $response->statusCode());
        $this->assertSame(['data' => $data, 'error' => null], $response->toArray());
    }

    public function test_success_envelope_accepts_custom_status_code(): void
    {
        $data = ['id' => 1];

        $response = ApiResponse::success($data, 201);

        $this->assertSame(201, $response->statusCode());
    }

    public function test_error_envelope_wraps_code_and_message_with_null_data(): void
    {
        $response = ApiResponse::error('user_not_found', 'User with id 1 was not found.', 404);

        $this->assertSame(404, $response->statusCode());
        $this->assertSame(
            ['data' => null, 'error' => ['code' => 'user_not_found', 'message' => 'User with id 1 was not found.']],
            $response->toArray(),
        );
    }

    public function test_to_json_encodes_the_envelope(): void
    {
        $response = ApiResponse::success(['id' => 1]);

        $json = $response->toJson();

        $this->assertSame('{"data":{"id":1},"error":null}', $json);
    }
}
