import * as core from '@actions/core'
import { sendReleaseNotification } from './slack.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get inputs from action configuration
    const releaseVersion: string = core.getInput('release-version')
    const slackBotTokenInput: string = core.getInput('slack-bot-token')
    const slackChannel: string =
      core.getInput('slack-channel') || '#feed_agglayer-notifier'
    const releaseUrl: string = core.getInput('release-url')
    const releaseNotes: string = core.getInput('release-notes')
    const customMessage: string = core.getInput('custom-message')

    // Determine bot token - use input if provided, otherwise try Agglayer default
    let slackBotToken: string = slackBotTokenInput
    if (!slackBotToken) {
      slackBotToken = process.env.SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE || ''
      if (slackBotToken) {
        core.info('Using default Agglayer bot token')
      }
    }

    // Validate required inputs
    if (!releaseVersion) {
      throw new Error('release-version is required')
    }
    if (!slackBotToken) {
      throw new Error(
        'slack-bot-token is required. Either provide it as an input or ensure SLACK_APP_TOKEN_AGGLAYER_NOTIFY_RELEASE secret is available.'
      )
    }

    core.info(`Sending release notification for version: ${releaseVersion}`)
    core.debug(`Target channel: ${slackChannel}`)
    if (releaseNotes) {
      core.debug(`Release notes provided for breaking change analysis`)
    }

    // Send the Slack notification
    await sendReleaseNotification(slackBotToken, slackChannel, {
      version: releaseVersion,
      releaseUrl: releaseUrl || undefined,
      releaseNotes: releaseNotes || undefined,
      customMessage: customMessage || undefined
    })

    core.info('Release notification sent successfully!')

    // Set outputs for other workflow steps to use
    core.setOutput('notification-sent', 'true')
    core.setOutput('timestamp', new Date().toISOString())
    core.setOutput('channel', slackChannel)
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(`Failed to send release notification: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}
