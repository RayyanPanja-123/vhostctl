import chalk from 'chalk'
import type { Command } from 'commander'

const RECIPES: Array<{ title: string; lines: string[] }> = [
  {
    title: 'Set up a fresh app on XAMPP',
    lines: ['vhostctl detect', 'vhostctl add myapp --domain myapp.local --root C:/xampp/htdocs/myapp', 'vhostctl reload'],
  },
  {
    title: 'Preview before touching any files',
    lines: ['vhostctl add myapp --dry-run'],
  },
  {
    title: 'Link an API subdomain to an existing vhost',
    lines: ['vhostctl subdomain add myapp api', 'vhostctl reload'],
  },
  {
    title: 'Temporarily take a site offline without deleting it',
    lines: ['vhostctl disable myapp', 'vhostctl reload'],
  },
  {
    title: 'Inspect what a vhost actually points to',
    lines: ['vhostctl view myapp'],
  },
  {
    title: 'Remove a vhost entirely',
    lines: ['vhostctl remove myapp', 'vhostctl reload'],
  },
]

export function registerExamplesCommand(program: Command): void {
  program
    .command('examples')
    .description('Show common vhostctl recipes')
    .action(() => {
      console.log(chalk.bold('\nvhostctl — common recipes\n'))
      for (const recipe of RECIPES) {
        console.log(chalk.underline(recipe.title))
        for (const line of recipe.lines) {
          console.log(chalk.dim('  $ ') + line)
        }
        console.log('')
      }
    })
}
