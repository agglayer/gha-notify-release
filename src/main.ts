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
    const token = core.getInput('slack-bot-token', { required: true })
    const channel = core.getInput('slack-channel') || 'C090TACJ9KN'
    const customMessage = core.getInput('custom-message')

    // Get release information from GitHub context or inputs
    const releaseVersion =
      core.getInput('release-version') ||
      github.context.payload.release?.tag_name
    const releaseUrl =
      core.getInput('release-url') || github.context.payload.release?.html_url
    const releaseBody =
      core.getInput('release-body') ||
      github.context.payload.release?.body ||
      ''
    const repositoryName =
      core.getInput('repository-name') ||
      `${github.context.repo.owner}/${github.context.repo.repo}`

    if (!releaseVersion) {
      throw new Error(
        'No release version found. This action should be triggered by a release event or provide release-version input.'
      )
    }

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
