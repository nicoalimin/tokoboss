#!/usr/bin/env node

import { createApp } from './ui/app';
import { runCLI } from './commands';

// Detect mode (TUI or CLI) and execute accordingly
if (process.argv.length < 3) {
  createApp(); // Launch TUI mode
} else {
  runCLI(process.argv.slice(2)); // Run CLI mode
}
