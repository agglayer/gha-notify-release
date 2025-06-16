import * as core from '@actions/core'
import * as github from '@actions/github'
import { sendReleaseNotification } from './slack.js'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get inputs
    const token = core.getInput('slack-token', { required: true })
    const channel = core.getInput('slack-channel') || 'C090TACJ9KN'
    const releaseBody = core.getInput('release-body')
    const releaseUrl = core.getInput('release-url')
    const releaseVersion = core.getInput('release-version', { required: true })
    const customMessage = core.getInput('custom-message')
    const repositoryName =
      core.getInput('repository-name') || github.context.repo.repo

    core.info(`🚀 Starting release notification for ${repositoryName}`)
    core.info(`📦 Version: ${releaseVersion}`)
    core.info(`📢 Slack channel: ${channel}`)

    if (customMessage) {
      core.info(`💬 Custom message: ${customMessage}`)
    }

    // Send Slack notification
    await sendReleaseNotification(token, channel, {
      version: releaseVersion,
      releaseUrl: releaseUrl,
      releaseNotes: releaseBody,
      customMessage: customMessage,
      repositoryName: repositoryName
    })

    core.info('✅ Release notification sent successfully!')
  } catch (error) {
    // Handle any errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.error(`❌ Action failed: ${errorMessage}`)
    core.setFailed(errorMessage)
  }
}
