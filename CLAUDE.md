# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

- PHP 8.5 (interpreter: `/opt/homebrew/Cellar/php/8.5.2/bin/php`)
- PHP language level: 8.3+
- Served from `/var/www/claude` (local web server)

## Code Quality Tools

The following tools are configured in the JetBrains IDE and should be used to lint/analyze PHP code:

- **PHP-CS-Fixer** — code style fixing
- **PHP_CodeSniffer (phpcs)** — coding standards enforcement
- **PHPStan** — static analysis
- **Psalm** — type-checking static analysis
