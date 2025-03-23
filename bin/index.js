#!/usr/bin/env node
const { program } = require('commander');

// Set up basic metadata
program
  .name('mycli')
  .description('A simple CLI built with Commander')
  .version('1.0.0');

// Define a command: greet
program
  .command('greet')
  .description('Prints a greeting')
  .option('-n, --name <string>', 'Name of the person to greet', 'World')
  .action((options) => {
    console.log(`Hello, ${options.name}!`);
  });

// Parse command-line arguments
program.parse(process.argv);
