const shellSafeWordPattern = /^[A-Za-z0-9_./:@+-]+$/
const missingRunCommand = 'echo "Set the repository run command before starting this service."'

export function shellQuote(value: string): string {
  if (shellSafeWordPattern.test(value)) {
    return value
  }

  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildRepositoryRunShellCommand(
  repositoryPath: string,
  runCommand: string
): string {
  const command = runCommand.trim() || missingRunCommand

  return `cd ${shellQuote(repositoryPath)} && ${command}`
}
