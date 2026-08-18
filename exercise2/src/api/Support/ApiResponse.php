<?php

declare(strict_types=1);

namespace Api\Support;

/**
 * Immutable value object for the project's standard API response envelope.
 *
 * Success: `{ "data": ..., "error": null }`
 * Failure: `{ "data": null, "error": { "code": ..., "message": ... } }`
 */
final class ApiResponse
{
    /**
     * @param mixed $data The response payload, or null on failure.
     * @param array{code: string, message: string}|null $error The error
     *        details, or null on success.
     */
    private function __construct(
        private readonly int $statusCode,
        private readonly mixed $data,
        private readonly ?array $error,
    ) {
    }

    /**
     * Build a success envelope.
     *
     * @param mixed $data The payload to return to the caller.
     * @param int $statusCode The HTTP status code, defaults to 200.
     * @return self
     */
    public static function success(mixed $data, int $statusCode = 200): self
    {
        return new self($statusCode, $data, null);
    }

    /**
     * Build an error envelope.
     *
     * @param string $code A short machine-readable error identifier.
     * @param string $message A human-readable description of the error.
     * @param int $statusCode The HTTP status code, e.g. 404.
     * @return self
     */
    public static function error(string $code, string $message, int $statusCode): self
    {
        return new self($statusCode, null, ['code' => $code, 'message' => $message]);
    }

    /**
     * The HTTP status code this response should be sent with.
     *
     * @return int
     */
    public function statusCode(): int
    {
        return $this->statusCode;
    }

    /**
     * The response envelope as a plain array.
     *
     * @return array{data: mixed, error: array{code: string, message: string}|null}
     */
    public function toArray(): array
    {
        return ['data' => $this->data, 'error' => $this->error];
    }

    /**
     * The response envelope encoded as a JSON string.
     *
     * @param int $flags json_encode() flags.
     * @return string
     */
    public function toJson(int $flags = JSON_THROW_ON_ERROR): string
    {
        return json_encode($this->toArray(), $flags);
    }

    /**
     * Emit this response over HTTP: sets the status code and content type
     * header, then echoes the JSON body. Side-effecting; not covered by
     * unit tests.
     *
     * @return void
     */
    public function send(): void
    {
        http_response_code($this->statusCode);
        header('Content-Type: application/json');
        echo $this->toJson();
    }
}
