import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
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
      // Keep format buttons out of tab order so focus rings don't look "enabled".
      tabIndex={-1}
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

/**
 * Default TipTap Bold/Italic also parse CSS font-weight / font-style, so form
 * chrome (company-form__input) falsely activates them. Only honor real tags.
 * inclusive:false so clicking beside formatted text doesn't keep the mark on.
 */
const ExplicitBold = Bold.extend({
  inclusive: false,
  parseHTML() {
    return [{ tag: 'strong' }, { tag: 'b' }]
  },
  addInputRules() {
    return []
  },
  addPasteRules() {
    return []
  },
})

const ExplicitItalic = Italic.extend({
  inclusive: false,
  parseHTML() {
    return [{ tag: 'em' }, { tag: 'i' }]
  },
  addInputRules() {
    return []
  },
  addPasteRules() {
    return []
  },
})

const ExplicitUnderline = Underline.extend({
  inclusive: false,
  addInputRules() {
    return []
  },
  addPasteRules() {
    return []
  },
})

/**
 * Toolbar highlight: use marks on the text under the cursor.
 * Stored marks only count when the user just clicked a toolbar button (intent set).
 */
function markIsActive(editor, name, intentionalMarks) {
  if (!editor) return false
  const type = editor.schema.marks[name]
  if (!type) return false
  const { state } = editor
  const { from, to, empty, $from } = state.selection
  if (!empty) return state.doc.rangeHasMark(from, to, type)
  if (type.isInSet($from.marks())) return true
  return intentionalMarks.has(name)
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
  const intentionalMarksRef = useRef(new Set())
  const editorRef = useRef(null)
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
      bold: false,
      italic: false,
    }),
    ExplicitBold,
    ExplicitItalic,
    ExplicitUnderline,
    Placeholder.configure({
      placeholder: placeholder || '',
    }),
  ], [placeholder])

  const bump = () => setTick((n) => n + 1)

  /** Drop TipTap stored marks the user did not turn on via the toolbar. */
  const prunePhantomStoredMarks = (editor) => {
    if (!editor) return
    const allowed = intentionalMarksRef.current
    const stored = editor.state.storedMarks
    if (isRichTextEmpty(editor.getHTML()) && !allowed.size) {
      editor.view.dispatch(editor.state.tr.setStoredMarks([]))
      bump()
      return
    }
    if (stored == null) {
      bump()
      return
    }
    const next = stored.filter((mark) => allowed.has(mark.type.name))
    // Keep intentional toolbar marks; clear anything TipTap inferred on its own.
    editor.view.dispatch(editor.state.tr.setStoredMarks(next))
    bump()
  }

  const hardResetFormattingUi = (editor) => {
    intentionalMarksRef.current = new Set()
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setStoredMarks([]))
    bump()
  }

  const editor = useEditor({
    extensions,
    content: sanitizeRichText(value || '') || '',
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        id: id || '',
        class: 'rich-text-editor__prose',
        'aria-label': placeholder || 'Text',
        style: 'font-weight:400;font-style:normal;',
      },
      handleDOMEvents: {
        // Clicking in the field clears phantom auto-marks, but keeps toolbar choices.
        mousedown: () => {
          const current = editorRef.current
          if (!current) return false
          requestAnimationFrame(() => prunePhantomStoredMarks(current))
          return false
        },
        focus: () => {
          const current = editorRef.current
          if (!current) return false
          requestAnimationFrame(() => prunePhantomStoredMarks(current))
          return false
        },
      },
    },
    onCreate: ({ editor: current }) => {
      editorRef.current = current
      hardResetFormattingUi(current)
    },
    onUpdate: ({ editor: current }) => {
      editorRef.current = current
      const html = normalizeRichTextValue(current.getHTML())
      if (isRichTextEmpty(html) && !intentionalMarksRef.current.size) {
        current.view.dispatch(current.state.tr.setStoredMarks([]))
      }
      emitChange(onChange, html, name)
      bump()
    },
    onSelectionUpdate: () => bump(),
    onDestroy: () => {
      editorRef.current = null
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(editable)
  }, [editor, editable])

  useEffect(() => {
    if (!editor) return
    const next = sanitizeRichText(value || '')
    const current = normalizeRichTextValue(editor.getHTML())
    if (next === current) return
    if (normalizeRichTextValue(next) === current) return
    editor.commands.setContent(next || '', false)
    hardResetFormattingUi(editor)
  }, [editor, value])

  const used = editor ? richTextLength(editor.getHTML()) : richTextLength(value)
  const exceeded = hasLimit && used > limit
  const countVisible = hasLimit && showCount !== false
  const intentional = intentionalMarksRef.current
  const boldActive = markIsActive(editor, 'bold', intentional)
  const italicActive = markIsActive(editor, 'italic', intentional)
  const underlineActive = markIsActive(editor, 'underline', intentional)

  const toggleMark = (markName, command) => {
    if (!editor) return
    const turningOn = !markIsActive(editor, markName, intentionalMarksRef.current)
    if (turningOn) intentionalMarksRef.current.add(markName)
    else intentionalMarksRef.current.delete(markName)
    editor.chain().focus()[command]().run()
    bump()
  }

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
            onClick={() => toggleMark('bold', 'toggleBold')}
          >
            B
          </ToolbarButton>
          <ToolbarButton
            title="Italic"
            className="rich-text-editor__btn--italic"
            active={italicActive}
            disabled={!editable}
            onClick={() => toggleMark('italic', 'toggleItalic')}
          >
            I
          </ToolbarButton>
          <ToolbarButton
            title="Underline"
            className="rich-text-editor__btn--underline"
            active={underlineActive}
            disabled={!editable}
            onClick={() => toggleMark('underline', 'toggleUnderline')}
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
