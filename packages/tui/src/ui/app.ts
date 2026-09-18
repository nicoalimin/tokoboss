import { select } from '@inquirer/prompts';

export const createApp = async () => {
  console.log('Welcome to TokoBoss TUI!');

  while (true) {
    const choice = await select({
      message: 'What would you like to do?',
      choices: [
        { name: 'Login', value: 'login' },
        { name: 'List Resources', value: 'list' },
        { name: 'Logout', value: 'logout' },
        { name: 'Exit', value: 'exit' },
      ],
    });

    if (choice === 'exit') {
      console.log('Goodbye!');
      break;
    }

    // Handle the selected action
    switch (choice) {
      case 'login':
        console.log('Login functionality coming soon...');
        break;
      case 'list':
        console.log('List resources functionality coming soon...');
        break;
      case 'logout':
        console.log('Logout functionality coming soon...');
        break;
    }
  }
};
