<?php
require 'vendor/autoload.php';

use Anthropic\Client;
use Anthropic\Messages\Model;
use Anthropic\Messages\TextBlock;
use Dotenv\Dotenv;

$dotenv = Dotenv::createImmutable(__DIR__);
$dotenv->safeLoad();

$client = new Client(getenv('ANTHROPIC_API_KEY'));

$message = $client->messages->create(
    maxTokens: 500,
    messages: [
        [
            'role' => 'user',
            'content' => 'What should I search for to find the latest developments in Anthropic Claude models?',
        ],
    ],
    model: Model::CLAUDE_SONNET_5,
);

foreach ($message->content as $block) {
    if ($block instanceof TextBlock) {
        echo $block->text . PHP_EOL;
    }
}