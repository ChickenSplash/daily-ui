import { useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Marked, type marked } from 'marked'
import { api } from '../lib/api'
import { download } from '../lib/dates'
import { Drafts, useDraft } from '../lib/drafts'
import type { Day, Journal } from '../lib/types'
import { Dialog } from './Dialog'

// Disable HTML at the tokenizer, not by changing the stored text. Code and quotes round-trip.
const safeMarked = new Marked({ tokenizer: { html: () => undefined, tag: () => undefined } })

export function JournalEditor({ journal, date, drafts }: { journal: Journal; date: string; drafts: Drafts }) {
  const key = `${journal.id}/${date}`
  const draft = useDraft(drafts, key, journal.entry)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(`daily-collapsed:${journal.id}`) === 'true'
    } catch {
      return false
    }
  })
  const [expanded, setExpanded] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [editorError, setEditorError] = useState('')
  const [linking, setLinking] = useState(false)
  const [version, setVersion] = useState(0)
  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3] },
          link: { openOnClick: false, protocols: ['https', 'http', 'mailto'] },
        }),
        Markdown.configure({ marked: safeMarked as unknown as typeof marked }),
      ],
      content: draft.body,
      contentType: 'markdown',
      editorProps: {
        attributes: (state) => ({
          role: 'textbox',
          'aria-label': journal.name,
          'aria-multiline': 'true',
          'data-placeholder': journal.prompt || 'Start writing…',
          'data-empty': String(
            state.doc.childCount === 1 &&
              state.doc.firstChild?.type.name === 'paragraph' &&
              state.doc.firstChild.content.size === 0,
          ),
        }),
      },
      onUpdate: ({ editor }) => drafts.edit(key, editor.getMarkdown()),
      onSelectionUpdate: () => setVersion((value) => value + 1),
    },
    [key],
  )
  void version
  const toolbar = editor && (
    <div className="editor-toolbar" role="toolbar" aria-label={`${journal.name} formatting`}>
      <button
        title="Bold (Ctrl+B)"
        aria-label="Bold"
        aria-pressed={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        title="Italic (Ctrl+I)"
        aria-label="Italic"
        aria-pressed={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        title="Heading"
        aria-label="Heading"
        aria-pressed={editor.isActive('heading')}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H₂
      </button>
      <button
        title="Bullet list"
        aria-label="Bullet list"
        aria-pressed={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        ☷
      </button>
      <button
        title="Quote"
        aria-label="Quote"
        aria-pressed={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        ❝
      </button>
      <button title="Link" aria-label="Link" aria-pressed={editor.isActive('link')} onClick={() => setLinking(true)}>
        ↗
      </button>
      <span className="toolbar-spacer" />
      <button
        title="Download Markdown"
        aria-label="Download Markdown"
        onClick={() =>
          download(draft.body, `${date}-${journal.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`, 'text/markdown')
        }
      >
        ↓
      </button>
      <button
        title={expanded ? 'Exit expanded editor' : 'Expand editor'}
        aria-label={expanded ? 'Exit expanded editor' : 'Expand editor'}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '↙' : '↗'}
      </button>
    </div>
  )
  return (
    <section
      className={`journal-card ${collapsed ? 'collapsed' : ''} ${expanded ? 'editor-expanded' : ''}`}
      aria-label={`${journal.name} section`}
    >
      <header>
        <button
          className="journal-title"
          aria-expanded={!collapsed}
          aria-controls={`journal-body-${journal.id}`}
          onClick={() => {
            const value = !collapsed
            setCollapsed(value)
            try {
              localStorage.setItem(`daily-collapsed:${journal.id}`, String(value))
            } catch {
              /* Optional preference. */
            }
          }}
        >
          <span className="journal-symbol">{journal.position === 1 ? '✧' : '▤'}</span>
          <span className="journal-heading-text">
            <span className="journal-title-row">
              <h2 title={journal.name}>{journal.name}</h2>
              {journal.archived_at && <small>Archived</small>}
            </span>
            {journal.prompt && (
              <span className="journal-prompt" title={journal.prompt}>
                {journal.prompt}
              </span>
            )}
          </span>
          <span className="collapse-icon">{collapsed ? '＋' : '−'}</span>
        </button>
      </header>
      <div className="journal-body" id={`journal-body-${journal.id}`} inert={collapsed} aria-hidden={collapsed}>
        <div className="journal-body-inner">
          {toolbar}
          <EditorContent editor={editor} />
          <footer>
            <span
              className={`save-state ${['error', 'conflict'].includes(draft.state) ? 'save-error' : ''}`}
              role="status"
            >
              {
                {
                  saved: '✓ Saved',
                  editing: 'Unsaved changes',
                  saving: 'Saving…',
                  error: 'Couldn’t save · draft retained',
                  conflict: 'Changed in another tab · draft retained',
                }[draft.state]
              }
            </span>
            <small>Markdown supported</small>
          </footer>
          {draft.error && (
            <div className="draft-warning">
              <p>{draft.error}</p>
              {draft.state !== 'conflict' && <button onClick={() => void drafts.save(key)}>Retry save</button>}
              <button onClick={() => setDiscard(true)}>Use saved version</button>
            </div>
          )}
        </div>
      </div>
      {discard && (
        <Dialog title="Use the saved version?" close={() => setDiscard(false)}>
          <p>Your unsaved draft will be replaced. Download it first if you want to keep a copy.</p>
          {editorError && <p role="alert">{editorError}</p>}
          <div className="dialog-actions">
            <button onClick={() => download(draft.body, `${date}-draft.md`, 'text/markdown')}>Download draft</button>
            <button
              className="danger"
              onClick={async () => {
                try {
                  const day = await api<Day>('GET', `/api/daily/days/${date}`)
                  const entry = day.journals.find((item) => item.id === journal.id)?.entry ?? null
                  drafts.useSaved(key, entry)
                  editor?.commands.setContent(entry?.body ?? '', { contentType: 'markdown', emitUpdate: false })
                  setDiscard(false)
                } catch (error) {
                  setEditorError(error instanceof Error ? error.message : 'Could not load saved version.')
                }
              }}
            >
              Use saved version
            </button>
          </div>
        </Dialog>
      )}
      {linking && (
        <Dialog title="Add a link" close={() => setLinking(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const value = String(new FormData(event.currentTarget).get('url'))
              if (/^(https?:\/\/|mailto:)/i.test(value))
                editor?.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
              setLinking(false)
            }}
          >
            <label>
              URL
              <input
                name="url"
                type="url"
                pattern="(https?://|mailto:).*"
                defaultValue={editor?.getAttributes('link').href ?? 'https://'}
                required
              />
            </label>
            <p>Select some text first, then add a link. Only HTTP, HTTPS and email links are supported.</p>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() => {
                  editor?.chain().focus().unsetLink().run()
                  setLinking(false)
                }}
              >
                Remove link
              </button>
              <button className="primary">Apply link</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  )
}
