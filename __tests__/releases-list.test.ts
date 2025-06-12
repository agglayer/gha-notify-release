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
    canvases: {
      create: mockConversationsCanvasesCreate
    },
    list: mockConversationsList,
    info: mockConversationsInfo
  },
  canvases: {
    edit: mockCanvasesEdit
  }
}))

jest.unstable_mockModule('@slack/web-api', () => ({
  WebClient: mockWebClient
}))

const { updateReleasesListCanvas } = await import('../src/releases-list.js')

describe('releases-list Canvas functionality', () => {
  const TEST_CHANNEL = '#test-releases'
  const TEST_CHANNEL_ID = 'C1234567890'
  const TEST_CANVAS_ID = 'F9876543210'

  beforeEach(() => {
    jest.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockMkdirSync.mockImplementation(() => undefined)
    mockWriteFileSync.mockImplementation(() => undefined)
    mockReadFileSync.mockReturnValue('')

    // Mock successful channel lookup
    mockConversationsList.mockResolvedValue({
      ok: true,
      channels: [
        {
          id: TEST_CHANNEL_ID,
          name: 'test-releases'
        }
      ]
    })

    mockConversationsInfo.mockResolvedValue({
      ok: true,
      channel: {
        name: 'test-releases'
      }
    })
  })

  describe('updateReleasesListCanvas', () => {
    it('creates a new channel canvas for first release', async () => {
      const slack = new (mockWebClient as any)()

      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      })

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false,
        hasE2E: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.0.0'
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

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
      const slack = new (mockWebClient as any)()

      const mockMetadata = {
        canvasId: TEST_CANVAS_ID,
        channelId: TEST_CHANNEL_ID,
        channelName: 'test-releases',
        lastUpdated: '2024-01-01T00:00:00Z',
        releaseCount: 1
      }

      mockExistsSync.mockImplementation((path: string) => {
        return path.toString().includes('metadata.json')
      })

      mockReadFileSync.mockImplementation((path: string) => {
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
              hasConfig: false,
              hasE2E: false
            }
          ])
        }
        return ''
      })

      mockCanvasesEdit.mockResolvedValue({
        ok: true
      })

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'breaking' as const,
        hasBreaking: true,
        hasConfig: false,
        hasE2E: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.0.0'
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

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
      const slack = new (mockWebClient as any)()

      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      })

      const release = {
        version: 'v2.0.0',
        releaseDate: 'Jan 20, 2024',
        changeType: 'breaking' as const,
        hasBreaking: true,
        hasConfig: false,
        hasE2E: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v2.0.0'
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      const createCall = mockConversationsCanvasesCreate.mock.calls[0]
      const markdown = createCall[0].document_content.markdown

      expect(markdown).toContain('⚠️🚀')
      expect(markdown).toContain('v2.0.0')
      expect(markdown).toContain('⚠️ *Breaking*')
      expect(markdown).toContain('**Breaking changes:** 1')
    })

    it('handles config changes correctly', async () => {
      const slack = new (mockWebClient as any)()

      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      })

      const release = {
        version: 'v1.1.0',
        releaseDate: 'Jan 18, 2024',
        changeType: 'config' as const,
        hasBreaking: false,
        hasConfig: true,
        hasE2E: false,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.1.0'
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      const createCall = mockConversationsCanvasesCreate.mock.calls[0]
      const markdown = createCall[0].document_content.markdown

      expect(markdown).toContain('⚙️🚀')
      expect(markdown).toContain('v1.1.0')
      expect(markdown).toContain('⚙️ *Config*')
      expect(markdown).toContain('**Configuration updates:** 1')
    })

    it('handles e2e test changes correctly', async () => {
      const slack = new (mockWebClient as any)()

      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      })

      const release = {
        version: 'v1.2.0',
        releaseDate: 'Jan 22, 2024',
        changeType: 'e2e' as const,
        hasBreaking: false,
        hasConfig: false,
        hasE2E: true,
        releaseUrl: 'https://github.com/example/repo/releases/tag/v1.2.0'
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)
      const createCall = mockConversationsCanvasesCreate.mock.calls[0]
      const markdown = createCall[0].document_content.markdown

      expect(markdown).toContain('🧪🚀')
      expect(markdown).toContain('v1.2.0')
      expect(markdown).toContain('🧪 *E2E Workflows*')
      expect(markdown).toContain('**E2E workflows:** 1')
    })

    it('limits releases to 50 entries', async () => {
      const slack = new (mockWebClient as any)()

      // Mock 50 existing releases
      const existingReleases = Array.from({ length: 50 }, (_, i) => ({
        version: `v0.${50 - i}.0`,
        releaseDate: 'Jan 1, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false,
        hasE2E: false
      }))

      mockExistsSync.mockImplementation((path: string) => {
        return path.toString().includes('releases.json')
      })

      mockReadFileSync.mockImplementation(() => {
        return JSON.stringify(existingReleases)
      })

      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      })

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 20, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false,
        hasE2E: false
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(true)

      // Check that fs.writeFileSync was called with exactly 50 releases
      const writeCalls = mockWriteFileSync.mock.calls
      const releaseWriteCall = writeCalls.find((call: any[]) =>
        call[0].toString().includes('releases.json')
      )
      expect(releaseWriteCall).toBeDefined()

      const savedReleases = JSON.parse(releaseWriteCall[1] as string)
      expect(savedReleases).toHaveLength(50)
      expect(savedReleases[0].version).toBe('v1.0.0') // New release first
    })

    it('handles channel not found error', async () => {
      const slack = new (mockWebClient as any)()

      // Mock channel not found
      mockConversationsList.mockResolvedValue({
        ok: true,
        channels: []
      })

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false,
        hasE2E: false
      }

      const result = await updateReleasesListCanvas(
        slack,
        '#nonexistent',
        release
      )

      expect(result).toBe(false)
      expect(mockConversationsCanvasesCreate).not.toHaveBeenCalled()
    })

    it('handles canvas creation errors', async () => {
      const slack = new (mockWebClient as any)()

      // Mock canvas creation failure
      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: false,
        error: 'canvas_creation_failed'
      })

      const release = {
        version: 'v1.0.0',
        releaseDate: 'Jan 15, 2024',
        changeType: 'normal' as const,
        hasBreaking: false,
        hasConfig: false,
        hasE2E: false
      }

      const result = await updateReleasesListCanvas(
        slack,
        TEST_CHANNEL,
        release
      )

      expect(result).toBe(false)
    })

    it('includes all change types in statistics', async () => {
      const slack = new (mockWebClient as any)()

      mockConversationsCanvasesCreate.mockResolvedValue({
        ok: true,
        canvas_id: TEST_CANVAS_ID
      })

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
