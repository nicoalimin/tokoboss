export const handleHelp = () => {
  return {
    success: true,
    message: `
TUI for TokoBoss

Usage:
  tui                     # Launch interactive TUI
  tui login               # Login to the system
  tui list <resource>     # List resources
  tui help                # Show this help

Commands:
  login       - Authenticate with the system  
  logout      - End your session
  list        - Display available resources
  help        - Show this help
    `,
  };
};
