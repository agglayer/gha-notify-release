/**
 * Unit tests for releases list Canvas functionality
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mock dependencies
jest.unstable_mockModule('@actions/core', () => core)

// Mock fs
const mockWriteFileSync = jest.fn()
const mockReadFileSync = jest.fn()
const mockExistsSync = jest.fn()
const mockMkdirSync = jest.fn()

jest.unstable_mockModule('fs', () => ({
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync
}))

// Mock Slack WebClient
const mockCanvasesEdit = jest.fn()
const mockConversationsCanvasesCreate = jest.fn()
const mockConversationsList = jest.fn()
const mockConversationsInfo = jest.fn()

const mockWebClient = jest.fn().mockImplementation(() => ({
  conversations: {
    list: mockConversationsList,
    info: mockConversationsInfo,
    canvases: {
      create: mockConversationsCanvasesCreate
    }
  },
  canvases: {
    edit: mockCanvasesEdit
  }
}))

jest.unstable_mockModule('@slack/web-api', () => ({
  WebClient: mockWebClient
}))

// Import the module being tested
const { updateReleasesListCanvas } = await import('../src/releases-list.js')

describe('releases-list Canvas functionality', () => {
  const TEST_CHANNEL = '#test-releases'
  const TEST_CHANNEL_ID = 'C1234567890'
  const TEST_CANVAS_ID = 'F9876543210'

  beforeEach(() => {
    jest.resetAllMocks()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockExistsSync as any).mockReturnValue(false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockMkdirSync as any).mockImplementation(() => undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockWriteFileSync as any).mockImplementation(() => {})

    // Mock channel lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockConversationsList as any).mockResolvedValue({
      ok: true,
      channels: [
        {
          id: TEST_CHANNEL_ID,
          name: 'test-releases'
        }
      ]
    })

    // Mock channel info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockConversationsInfo as any).mockResolvedValue({
      ok: true,
      channel: {
        name: 'test-releases'
      }
    })
  })

  it('creates new channel canvas for first release', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = new (mockWebClient as any)()

    // Mock successful canvas creation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockConversationsCanvasesCreate as any).mockResolvedValue({
      ok: true,
      canvas_id: TEST_CANVAS_ID
    })

    const release = {
      version: 'v1.0.0',
      releaseDate: 'Jan 15, 2024',
      changeType: 'normal' as const,
      hasBreaking: false,
      hasConfig: false,
      releaseUrl: 'https://github.com/example/repo/releases/tag/v1.0.0'
    }

    const result = await updateReleasesListCanvas(slack, TEST_CHANNEL, release)

    expect(result).toBe(true)
    expect(mockConversationsCanvasesCreate).toHaveBeenCalledWith({
      channel_id: TEST_CHANNEL_ID,
      document_content: {
        type: 'markdown',
        markdown: expect.stringContaining('# 📦 test-releases Releases')
      }
    })
  })

  it('updates existing canvas when metadata exists', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = new (mockWebClient as any)()

    // Mock existing metadata
    const mockMetadata = {
      canvasId: TEST_CANVAS_ID,
      channelId: TEST_CHANNEL_ID,
      channelName: 'test-releases',
      lastUpdated: '2024-01-01T00:00:00Z',
      releaseCount: 1
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockExistsSync as any).mockImplementation((path: string) => {
      return path.toString().includes('metadata.json')
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockReadFileSync as any).mockImplementation((path: string) => {
      if (path.toString().includes('metadata.json')) {
        return JSON.stringify(mockMetadata)
      }
      if (path.toString().includes('releases.json')) {
        return JSON.stringify([
          {
            version: 'v0.9.0',
            releaseDate: 'Jan 10, 2024',
            changeType: 'normal',
            hasBreaking: false,
            hasConfig: false
          }
        ])
      }
      return ''
    })

    // Mock successful canvas update
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockCanvasesEdit as any).mockResolvedValue({
      ok: true
    })

    const release = {
      version: 'v1.0.0',
      releaseDate: 'Jan 15, 2024',
      changeType: 'breaking' as const,
      hasBreaking: true,
      hasConfig: false,
      releaseUrl: 'https://github.com/example/repo/releases/tag/v1.0.0'
    }

    const result = await updateReleasesListCanvas(slack, TEST_CHANNEL, release)

    expect(result).toBe(true)
    expect(mockCanvasesEdit).toHaveBeenCalledWith({
      canvas_id: TEST_CANVAS_ID,
      changes: [
        {
          operation: 'replace',
          document_content: {
            type: 'markdown',
            markdown: expect.stringContaining('⚠️🚀')
          }
        }
      ]
    })
  })

  it('handles breaking changes correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = new (mockWebClient as any)()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockConversationsCanvasesCreate as any).mockResolvedValue({
      ok: true,
      canvas_id: TEST_CANVAS_ID
    })

    const release = {
      version: 'v2.0.0',
      releaseDate: 'Jan 20, 2024',
      changeType: 'breaking' as const,
      hasBreaking: true,
      hasConfig: false,
      releaseUrl: 'https://github.com/example/repo/releases/tag/v2.0.0'
    }

    const result = await updateReleasesListCanvas(slack, TEST_CHANNEL, release)

    expect(result).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createCall = (mockConversationsCanvasesCreate as any).mock.calls[0]
    const markdown = createCall[0].document_content.markdown

    expect(markdown).toContain('⚠️🚀')
    expect(markdown).toContain('v2.0.0')
    expect(markdown).toContain('⚠️ *Breaking*')
    expect(markdown).toContain('**Breaking changes:** 1')
  })

  it('handles config changes correctly', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = new (mockWebClient as any)()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockConversationsCanvasesCreate as any).mockResolvedValue({
      ok: true,
      canvas_id: TEST_CANVAS_ID
    })

    const release = {
      version: 'v1.1.0',
      releaseDate: 'Jan 18, 2024',
      changeType: 'config' as const,
      hasBreaking: false,
      hasConfig: true,
      releaseUrl: 'https://github.com/example/repo/releases/tag/v1.1.0'
    }

    const result = await updateReleasesListCanvas(slack, TEST_CHANNEL, release)

    expect(result).toBe(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createCall = (mockConversationsCanvasesCreate as any).mock.calls[0]
    const markdown = createCall[0].document_content.markdown

    expect(markdown).toContain('⚙️🚀')
    expect(markdown).toContain('v1.1.0')
    expect(markdown).toContain('⚙️ *Config*')
    expect(markdown).toContain('**Configuration updates:** 1')
  })

  it('limits releases to 50 entries', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = new (mockWebClient as any)()

    // Mock 50 existing releases
    const existingReleases = Array.from({ length: 50 }, (_, i) => ({
      version: `v0.${50 - i}.0`,
      releaseDate: 'Jan 1, 2024',
      changeType: 'normal' as const,
      hasBreaking: false,
      hasConfig: false
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockExistsSync as any).mockImplementation((path: string) => {
      return path.toString().includes('releases.json')
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockReadFileSync as any).mockImplementation(() => {
      return JSON.stringify(existingReleases)
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(mockConversationsCanvasesCreate as any).mockResolvedValue({
      ok: true,
      canvas_id: TEST_CANVAS_ID
    })

    const release = {
      version: 'v1.0.0',
      releaseDate: 'Jan 20, 2024',
      changeType: 'normal' as const,
      hasBreaking: false,
      hasConfig: false
    }

    const result = await updateReleasesListCanvas(slack, TEST_CHANNEL, release)

    expect(result).toBe(true)

    // Check that fs.writeFileSync was called with exactly 50 releases
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeCalls = (mockWriteFileSync as any).mock.calls
    const releaseWriteCall = writeCalls.find((call: any[]) =>
      call[0].toString().includes('releases.json')
    )
    expect(releaseWriteCall).toBeDefined()

    const savedReleases = JSON.parse(releaseWriteCall[1] as string)
    expect(savedReleases).toHaveLength(50)
    expect(savedReleases[0].version).toBe('v1.0.0') // New release first
  })

  it('handles channel not found error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const slack = new (mockWebClient as any)()

  describe('updateReleasesListCanvas', () => {
    it('should create a new channel canvas for first release', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      // Mock successful canvas creation
      vi.mocked(mockWebClient.conversations.canvases.create).mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      } as any)

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.0.0'
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      expect(mockWebClient.conversations.canvases.create).toHaveBeenCalledWith({
        channel_id: TEST_CHANNEL_ID,
        document_content: {
          type: 'markdown',
          markdown: expect.stringContaining('# 📦 test-releases Releases')
        }
      })
    })

    it('should update existing canvas when metadata exists', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      // Mock existing metadata
      const mockMetadata = {
        canvasId: TEST_CANVAS_ID,
        channelId: TEST_CHANNEL_ID,
        channelName: 'test-releases',
        lastUpdated: '2024-01-01T00:00:00Z',
        releaseCount: 1
      }

      vi.mocked(fs.existsSync).mockImplementation((path: string) => {
        return path.toString().includes('metadata.json')
      })

      vi.mocked(fs.readFileSync).mockImplementation((path: string) => {
        if (path.toString().includes('metadata.json')) {
          return JSON.stringify(mockMetadata)
        }
        if (path.toString().includes('releases.json')) {
          return JSON.stringify([
            {
              version: 'v0.9.0',
              releaseDate: 'Jan 10, 2024',
              changeType: 'normal',
              hasBreaking: false,
              hasConfig: false
            }
          ])
        }
        return ''
      })

      // Mock successful canvas update
      vi.mocked(mockWebClient.canvases.edit).mockResolvedValue({
        ok: true
      } as any)

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'breaking' as const,
        hasBreaking: true,
        hasConfig: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.0.0'
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      expect(mockWebClient.canvases.edit).toHaveBeenCalledWith({
        canvas_id: TEST_CANVAS_ID,
        changes: [
          {
            operation: 'replace',
            document_content: {
              type: 'markdown',
              markdown: expect.stringContaining('⚠️🚀 v1.0.0')
            }
          }
        ]
      })
    })

    it('should handle breaking changes correctly', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      vi.mocked(mockWebClient.conversations.canvases.create).mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      } as any)

      const release = {
        version: 'v2.0.0',
        releaseDate: 'Jan 20, 2024',
        changeType: 'breaking' as const,
        hasBreaking: true,
        hasConfig: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v2.0.0'
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      const createCall = vi.mocked(mockWebClient.conversations.canvases.create)
        .mock.calls[0]
      const markdown = createCall[0].document_content.markdown

      expect(markdown).toContain(
        '⚠️🚀 [v2.0.0](https://github.com/example/repo/releases/tag/v2.0.0)'
      )
      expect(markdown).toContain('⚠️ *Breaking*')
      expect(markdown).toContain('**Breaking changes:** 1')
    })

    it('should handle config changes correctly', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      vi.mocked(mockWebClient.conversations.canvases.create).mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      } as any)

      const release = {
        version: 'v1.1.0',
        releaseDate: 'Jan 18, 2024',
        changeType: 'config' as const,
        hasBreaking: false,
        hasConfig: true,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.1.0'
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      const createCall = vi.mocked(mockWebClient.conversations.canvases.create)
        .mock.calls[0]
      const markdown = createCall[0].document_content.markdown

      expect(markdown).toContain(
        '⚙️🚀 [v1.1.0](https://github.com/example/repo/releases/tag/v1.1.0)'
      )
      expect(markdown).toContain('⚙️ *Config*')
      expect(markdown).toContain('**Configuration updates:** 1')
    })

    it('should limit releases to 50 entries', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      // Mock 50 existing releases
      const existingReleases = Array.from({ length: 50 }, (_, i) => ({
        version: `v0.${50 - i}.0`,
        releaseDate: 'Jan 1, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false
      }))

      vi.mocked(fs.existsSync).mockImplementation((path: string) => {
        return path.toString().includes('releases.json')
      })

      vi.mocked(fs.readFileSync).mockImplementation(() => {
        return JSON.stringify(existingReleases)
      })

      vi.mocked(mockWebClient.conversations.canvases.create).mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      } as any)

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 20, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)

      // Check that fs.writeFileSync was called with exactly 50 releases
      const writeCall = vi
        .mocked(fs.writeFileSync)
        .mock.calls.find((call) => call[0].toString().includes('releases.json'))
      expect(writeCall).toBeDefined()

      const savedReleases = JSON.parse(writeCall![1] as string)
      expect(savedReleases).toHaveLength(50)
      expect(savedReleases[0].version).toBe('v1.0.0') // New release first
    })

    it('should handle channel not found error', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      // Mock channel not found
      vi.mocked(mockWebClient.conversations.list).mockResolvedValue({
        ok: true,
        channels: []
      } as any)

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        '#nonexistent',
        release
      )

      expect(result).toBe(false)
      expect(mockWebClient.conversations.canvases.create).not.toHaveBeenCalled()
    })

    it('should handle canvas creation errors', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      // Mock canvas creation failure
      vi.mocked(mockWebClient.conversations.canvases.create).mockResolvedValue({
        ok: false,
        error: 'canvas_creation_failed'
      } as any)

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(false)
    })

    it('should handle channel canvas already exists error', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      // Mock canvas already exists error
      const error = new Error('Canvas creation failed') as any
      error.data = { error: 'channel_canvas_already_exists' }
      vi.mocked(mockWebClient.conversations.canvases.create).mockRejectedValue(
        error
      )

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(false)
    })

    it('should generate proper markdown for empty releases list', async () => {
      const { updateReleasesListCanvas } = await import(
        '../src/releases-list.js'
      )

      vi.mocked(mockWebClient.conversations.canvases.create).mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      } as any)

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false
      }

      const result = await updateReleasesListCanvas(
        mockWebClient,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      const createCall = vi.mocked(mockWebClient.conversations.canvases.create)
        .mock.calls[0]
      const markdown = createCall[0].document_content.markdown

      expect(markdown).toContain('# 📦 test-releases Releases')
      expect(markdown).toContain('## 🚀 Recent Releases')
      expect(markdown).toContain('### 🚀 v1.0.0')
      expect(markdown).toContain('**Jan 15, 2024**')
      expect(markdown).toContain('## 📊 Release Statistics')
      expect(markdown).toContain('**Total releases tracked:** 1')
    })
  })
})
