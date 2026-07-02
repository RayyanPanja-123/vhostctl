import chalk from 'chalk'

export const logger = {
  info(message: string): void {
    console.log(chalk.cyan('info'), message)
  },
  success(message: string): void {
    console.log(chalk.green('✓'), message)
  },
  warn(message: string): void {
    console.log(chalk.yellow('warn'), message)
  },
  error(message: string): void {
    console.error(chalk.red('error'), message)
  },
  dim(message: string): void {
    console.log(chalk.dim(message))
  },
  plain(message: string): void {
    console.log(message)
  },
  heading(message: string): void {
    console.log('\n' + chalk.bold.underline(message))
  },
}
