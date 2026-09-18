import { Command } from 'commander';
import { handleLogin } from './login';
import { handleLogout } from './logout';
import { handleList } from './list';
import { handleHelp } from './help';

export const runCLI = async (args: string[]) => {
  const program = new Command();
  
  program
    .name('tui')
    .description('TUI for TokoBoss')
    .version('0.0.1');

  program
    .command('login')
    .description('Login to the system')
    .option('-u, --username <username>', 'Username')
    .option('-p, --password <password>', 'Password')
    .action(async (options) => {
      const result = await handleLogin(options.username, options.password);
      if (result.success) {
        console.log('Login successful');
      } else {
        console.error(`Login failed: ${result.error}`);
      }
    });

  program
    .command('logout')
    .description('Logout from the system')
    .action(() => {
      const result = handleLogout();
      console.log(result.message);
    });

  program
    .command('list <resource>')
    .description('List resources')
    .action(async (resource) => {
      const result = await handleList(resource);
      if (result.success) {
        console.log(JSON.stringify(result.data, null, 2));
      } else {
        console.error(`Listing failed: ${result.error}`);
      }
    });

  program
    .command('help')
    .description('Show help')
    .action(() => {
      const result = handleHelp();
      console.log(result.message);
    });

  // Parse the arguments
  if (args.length === 0) {
    program.help();
  } else {
    program.parse(args);
  }
};