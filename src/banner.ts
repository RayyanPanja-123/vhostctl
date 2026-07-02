import chalk from 'chalk'
import figlet from 'figlet'

export function printBanner(version: string): void {
  console.log(chalk.cyan(figlet.textSync('vhostctl', { font: 'Standard' })))
  console.log(chalk.dim(`  Cross-platform virtual host manager · v${version}`))
  console.log(chalk.dim('  XAMPP · WAMP · Apache · Nginx — Windows, macOS, Linux'))
  console.log('')
}
