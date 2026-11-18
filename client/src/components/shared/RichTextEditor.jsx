import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import { FontSize, TextStyle } from '@tiptap/extension-text-style'
import Placeholder from '@tiptap/extension-placeholder'
import {
  normalizeRichTextValue,
  richTextLength,
  sanitizeRichText,
} from '../../lib/richText'
import './RichTextEditor.css'

const FONT_SIZES = [
  { label: 'Small', value: '12px' },
  { label: 'Normal', value: '14px' },
  { label: 'Large', value: '18px' },
  { label: 'XL', value: '22px' },
]

function emitChange(onChange, nextValue, name) {
  if (!onChange) return
  onChange({
    target: { value: nextValue, name: name || '' },
    currentTarget: { value: nextValue, name: name || '' },
  })
}

function ToolbarButton({ active, disabled, onClick, className = '', title, children }) {
  return (
    <button
      type="button"
      className={`rich-text-editor__btn ${className}${active ? ' is-active' : ''}`.trim()}
      title={title}
      aria-label={title}
      aria-pressed={active ? 'true' : 'false'}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function IconList() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="2.5" cy="4" r="1.2" fill="currentColor" />
      <circle cx="2.5" cy="8" r="1.2" fill="currentColor" />
      <circle cx="2.5" cy="12" r="1.2" fill="currentColor" />
      <rect x="5.5" y="3.2" width="9" height="1.6" rx="0.6" fill="currentColor" />
      <rect x="5.5" y="7.2" width="9" height="1.6" rx="0.6" fill="currentColor" />
      <rect x="5.5" y="11.2" width="9" height="1.6" rx="0.6" fill="currentColor" />
    </svg>
  )
}

function IconOrdered() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <text x="1" y="5.2" fontSize="5.5" fontWeight="700" fill="currentColor">1</text>
      <text x="1" y="9.2" fontSize="5.5" fontWeight="700" fill="currentColor">2</text>
      <text x="1" y="13.2" fontSize="5.5" fontWeight="700" fill="currentColor">3</text>
      <rect x="5.5" y="3.2" width="9" height="1.6" rx="0.6" fill="currentColor" />
      <rect x="5.5" y="7.2" width="9" height="1.6" rx="0.6" fill="currentColor" />
      <rect x="5.5" y="11.2" width="9" height="1.6" rx="0.6" fill="currentColor" />
    </svg>
  )
}

function IconHighlight() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 12.5 9.2 3.4a1.2 1.2 0 0 1 1.8-.2l1.3 1.3a1.2 1.2 0 0 1-.1 1.8L6 14.5H3v-2Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2.5 14.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconLink() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M7.2 8.8a2.8 2.8 0 0 0 4 0l1.6-1.6a2.8 2.8 0 1 0-4-4L7.6 4.4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8.8 7.2a2.8 2.8 0 0 0-4 0L3.2 8.8a2.8 2.8 0 1 0 4 4l1.2-1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export default function RichTextEditor({
  value = '',
  onChange,
  disabled = false,
  readOnly = false,
  name,
  maxLength,
  showCount,
  placeholder = '',
  className = '',
  id,
  compact = false,
}) {
  const [, setTick] = useState(0)
  const limit = Number(maxLength)
  const hasLimit = Number.isFinite(limit) && limit > 0
  const editable = !disabled && !readOnly

  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: false,
      codeBlock: false,
      code: false,
      blockquote: false,
      horizontalRule: false,
      strike: false,
    }),
    Underline,
    Highlight.configure({ multicolor: false }),
    TextStyle,
    FontSize,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    Placeholder.configure({
      placeholder: placeholder || '',
    }),
  ], [placeholder])

  const editor = useEditor({
    extensions,
    content: sanitizeRichText(value || '') || '',
    editable,
    // Required for React 18 Strict Mode — otherwise the editor often fails to mount.
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id: id || '',
        class: 'rich-text-editor__prose',
        'aria-label': placeholder || 'Text',
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = normalizeRichTextValue(current.getHTML())
      emitChange(onChange, html, name)
      setTick((n) => n + 1)
    },
    onSelectionUpdate: () => setTick((n) => n + 1),
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editor, editable])

  useEffect(() => {
    if (!editor) return
    const next = sanitizeRichText(value || '')
    const current = normalizeRichTextValue(editor.getHTML())
    if (next === current) return
    // Avoid clobbering while typing the same logical content.
    if (normalizeRichTextValue(next) === current) return
    editor.commands.setContent(next || '', false)
  }, [editor, value])

  const used = editor ? richTextLength(editor.getHTML()) : richTextLength(value)
  const exceeded = hasLimit && used > limit
  const countVisible = hasLimit && showCount !== false

  const setLink = () => {
    if (!editor) return
    // Toggle off if the selection is already a link — no dialog.
    if (editor.isActive('link')) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const { from, to, empty } = editor.state.selection
    if (empty) return
    const selected = String(editor.state.doc.textBetween(from, to, ' ') || '').trim()
    if (!selected) return
    // Selected text becomes the link target (typed URL / domain / path).
    const href = /^(https?:\/\/|mailto:|tel:)/i.test(selected)
      ? selected
      : `https://${selected.replace(/^\/+/, '')}`
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }

  const fontSizeValue = editor?.getAttributes('textStyle')?.fontSize || ''

  return (
    <div
      className={[
        'rich-text-editor',
        'spellcheck-field',
        compact ? 'rich-text-editor--compact' : '',
        className,
        disabled ? 'rich-text-editor--disabled' : '',
        exceeded ? 'rich-text-editor--exceeded' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="rich-text-editor__toolbar" role="toolbar" aria-label="Formatting">
        <div className="rich-text-editor__group">
          <ToolbarButton
            title="Bold"
            className="rich-text-editor__btn--bold"
            active={editor?.isActive('bold')}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            className="rich-text-editor__btn--italic"
            active={editor?.isActive('italic')}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            I
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            className="rich-text-editor__btn--underline"
            active={editor?.isActive('underline')}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            U
          </ToolbarButton>
        </div>

        <span className="rich-text-editor__sep" aria-hidden="true" />

        <div className="rich-text-editor__group">
          <ToolbarButton
            title="Bullet list"
            active={editor?.isActive('bulletList')}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <IconList />
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={editor?.isActive('orderedList')}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <IconOrdered />
          </ToolbarButton>
        </div>

        <span className="rich-text-editor__sep" aria-hidden="true" />

        <div className="rich-text-editor__group">
          <ToolbarButton
            title="Highlight"
            active={editor?.isActive('highlight')}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleHighlight().run()}
          >
            <IconHighlight />
          </ToolbarButton>
          <select
            className="rich-text-editor__select"
            title="Text size"
            aria-label="Text size"
            disabled={!editable}
            value={fontSizeValue}
            onChange={(e) => {
              const next = e.target.value
              if (!next) editor?.chain().focus().unsetFontSize().run()
              else editor?.chain().focus().setFontSize(next).run()
            }}
          >
            <option value="">Size</option>
            {FONT_SIZES.map((size) => (
              <option key={size.value} value={size.value}>{size.label}</option>
            ))}
          </select>
        </div>

        <span className="rich-text-editor__sep" aria-hidden="true" />

        <div className="rich-text-editor__group">
          <ToolbarButton
            title="Link selected text"
            active={editor?.isActive('link')}
            disabled={!editable}
            onClick={setLink}
          >
            <IconLink />
          </ToolbarButton>
        </div>
      </div>

      <div className="rich-text-editor__content">
        <EditorContent editor={editor} />
      </div>

      {(countVisible || exceeded) && (
        <div className="rich-text-editor__footer">
          {exceeded ? (
            <span className="rich-text-editor__error spellcheck-field__error">Character exceeds</span>
          ) : <span />}
          {countVisible && (
            <span>{used}/{limit}</span>
          )}
        </div>
      )}
    </div>
  )
}
