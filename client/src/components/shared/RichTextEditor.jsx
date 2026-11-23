import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import {
  isRichTextEmpty,
  normalizeRichTextValue,
  richTextLength,
  sanitizeRichText,
} from '../../lib/richText'
import './RichTextEditor.css'

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
    onCreate: ({ editor: current }) => {
      // Empty docs should not keep sticky bold/italic from a prior focus.
      if (isRichTextEmpty(current.getHTML())) {
        current.commands.unsetAllMarks()
      }
    },
    onUpdate: ({ editor: current }) => {
      const html = normalizeRichTextValue(current.getHTML())
      emitChange(onChange, html, name)
      setTick((n) => n + 1)
    },
    onSelectionUpdate: () => setTick((n) => n + 1),
    onFocus: ({ editor: current }) => {
      if (isRichTextEmpty(current.getHTML())) {
        current.commands.unsetAllMarks()
        setTick((n) => n + 1)
      }
    },
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
    if (isRichTextEmpty(next)) {
      editor.commands.unsetAllMarks()
    }
  }, [editor, value])

  const used = editor ? richTextLength(editor.getHTML()) : richTextLength(value)
  const exceeded = hasLimit && used > limit
  const countVisible = hasLimit && showCount !== false
  const boldActive = Boolean(editor?.isActive('bold'))
  const italicActive = Boolean(editor?.isActive('italic'))
  const underlineActive = Boolean(editor?.isActive('underline'))

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
            active={boldActive}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            className="rich-text-editor__btn--italic"
            active={italicActive}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            I
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            className="rich-text-editor__btn--underline"
            active={underlineActive}
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
            active={Boolean(editor?.isActive('bulletList'))}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <IconList />
          </ToolbarButton>
          <ToolbarButton
            title="Numbered list"
            active={Boolean(editor?.isActive('orderedList'))}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <IconOrdered />
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
