import * as core from '@actions/core'
import * as github from '@actions/github'
import { WebClient } from '@slack/web-api'
import { sendReleaseNotification } from './slack.js'
import { updateRepositoryCanvas } from './releases-list.js'
import { analyzeBreakingChanges } from './breaking-changes.js'
import { analyzeConfigChanges } from './config-analysis.js'
import { analyzeE2ETests } from './e2e-analysis.js'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get inputs from the workflow
    const slackBotToken = core.getInput('slack-bot-token', { required: true })
    const slackChannel = core.getInput('slack-channel') || 'C090TACJ9KN'
    const customMessage = core.getInput('custom-message')
    const maintainReleasesList = core.getBooleanInput('maintain-releases-list')

    // Get release information from GitHub context
    const releaseVersion =
      github.context.payload.release?.tag_name ||
      core.getInput('release-version')
    const releaseUrl = github.context.payload.release?.html_url
    const releaseNotes = github.context.payload.release?.body || ''

    if (!releaseVersion) {
      throw new Error(
        'No release version found. This action should be triggered by a release event or provide release-version input.'
      )
    }

    core.info(`Sending release notification for version: ${releaseVersion}`)
    core.debug(`Target channel: ${slackChannel}`)
    core.debug(`Release notes length: ${releaseNotes.length} characters`)
    if (maintainReleasesList) {
      core.debug(`Repository canvas maintenance enabled`)
    }

    // Analyze release notes for breaking changes, config changes, and e2e tests
    const breakingAnalysis = analyzeBreakingChanges(releaseNotes)
    const configAnalysis = analyzeConfigChanges(releaseNotes)
    const e2eAnalysis = analyzeE2ETests(releaseNotes)

    // Get repository name from GitHub context
    const repositoryName =
      github.context.repo.owner + '/' + github.context.repo.repo

    // Send the Slack notification
    await sendReleaseNotification(slackBotToken, slackChannel, {
      version: releaseVersion,
      releaseUrl: releaseUrl || undefined,
      releaseNotes: releaseNotes || undefined,
      customMessage: customMessage || undefined,
      repositoryName
    })

    core.info('Release notification sent successfully!')

    // Update repository canvas if enabled
    let repositoryCanvasUpdated = false
    if (maintainReleasesList) {
      const slack = new WebClient(slackBotToken)

      repositoryCanvasUpdated = await updateRepositoryCanvas(
        slack,
        slackChannel,
        {
          repositoryName,
          version: releaseVersion,
          releaseUrl: releaseUrl || undefined,
          customMessage: customMessage || undefined,
          breakingAnalysis,
          configAnalysis,
          e2eAnalysis
        }
      )

      if (repositoryCanvasUpdated) {
        core.info('Repository canvas updated successfully!')
      } else {
        core.warning(
          'Failed to update repository canvas. Check if the bot has canvases:write permission and access to the channel.'
        )
      }
    }

    // Set outputs for other workflow steps to use
    core.setOutput('notification-sent', 'true')
    core.setOutput('timestamp', new Date().toISOString())
    core.setOutput('channel', slackChannel)
    core.setOutput(
      'repository-canvas-updated',
      repositoryCanvasUpdated.toString()
    )
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) {
      core.setFailed(`Failed to send release notification: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}
