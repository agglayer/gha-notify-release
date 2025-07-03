/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import * as core from '@actions/core'
import * as github from '@actions/github'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPostMessage = jest.fn<any>()
const mockWebClient = jest.fn().mockImplementation(() => ({
  chat: {
    postMessage: mockPostMessage
  }
}))

jest.mock('@slack/web-api', () => ({
  WebClient: mockWebClient
}))

describe('main.ts', () => {
  let getInputSpy: jest.SpiedFunction<typeof core.getInput>
  let setFailedSpy: jest.SpiedFunction<typeof core.setFailed>
  let infoSpy: jest.SpiedFunction<typeof core.info>

  beforeEach(() => {
    jest.clearAllMocks()

    getInputSpy = jest
      .spyOn(core, 'getInput')
      .mockImplementation((name: string) => {
        switch (name) {
          case 'slack-bot-token':
            return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
          case 'slack-channel':
            return 'releases'
          case 'release-version':
            return 'v1.0.0'
          case 'release-url':
            return 'https://github.com/owner/repo/releases/tag/v1.0.0'
          case 'release-body':
            return 'Bug fixes and improvements'
          case 'repository-name':
            return 'owner/repo'
          default:
            return ''
        }
      })

    setFailedSpy = jest.spyOn(core, 'setFailed').mockImplementation(() => {})
    infoSpy = jest.spyOn(core, 'info').mockImplementation(() => {})

    // Mock GitHub context
    Object.defineProperty(github, 'context', {
      value: {
        repo: {
          owner: 'owner',
          repo: 'repo'
        }
      }
    })

    // Setup successful Slack API response
    mockPostMessage.mockResolvedValue({
      ok: true,
      channel: 'C1234567890',
      ts: '1609459200.123456',
      message: {
        text: 'Release notification sent'
      }
    })
  })

  it('Sends notification successfully', async () => {
    const { run } = await import('../src/main.js')

    await run()

    // Verify that WebClient was instantiated with the bot token
    expect(mockWebClient).toHaveBeenCalledWith(
      'xoxb-123456789012-1234567890123-abcdefghijklmnop'
    )

    // Verify that postMessage was called
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'releases',
        text: expect.stringContaining('owner/repo v1.0.0')
      })
    )

    // Verify success message
    expect(infoSpy).toHaveBeenCalledWith(
      '✅ Release notification sent successfully!'
    )
  })

  it('Uses default channel when not specified', async () => {
    getInputSpy.mockImplementation((name: string) => {
      switch (name) {
        case 'slack-bot-token':
          return 'xoxb-123456789012-1234567890123-abcdefghijklmnop'
        case 'slack-channel':
          return '' // No channel specified
        case 'release-version':
          return 'v1.0.0'
        default:
          return ''
      }
    })

    const { run } = await import('../src/main.js')

    await run()

    // Verify that postMessage was called with default channel
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C090TACJ9KN'
      })
    )
  })

  it('Sets a failed status when no bot token is available', async () => {
    getInputSpy.mockImplementation((name: string) => {
      if (name === 'slack-bot-token') {
        return '' // No token provided
      }
      return 'default-value'
    })

    const { run } = await import('../src/main.js')

    await run()

    // Verify that the action was marked as failed
    expect(setFailedSpy).toHaveBeenCalledWith(
      expect.stringContaining('slack-bot-token is required')
    )
  })

  it('Sets a failed status when Slack API fails', async () => {
    mockPostMessage.mockRejectedValue(new Error('Slack API error'))

    const { run } = await import('../src/main.js')

    await run()

    // Verify that the action was marked as failed
    expect(setFailedSpy).toHaveBeenCalledWith(
      expect.stringContaining('Slack API error')
    )
  })
})
