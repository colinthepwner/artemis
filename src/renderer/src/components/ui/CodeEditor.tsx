import { useEffect, useMemo, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search'
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
  HighlightStyle
} from '@codemirror/language'
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import { java } from '@codemirror/lang-java'
import { tags as t } from '@lezer/highlight'
import { useProjectStore } from '@/store/projectStore'
import { buildCompletions, type CompletionItem } from '@shared/generator/completions'

const artemisTheme = EditorView.theme(
  {
    '&': { color: '#cccccc', backgroundColor: 'transparent', height: '100%' },
    '.cm-content': {

      fontFamily: '"Recursive Variable", Consolas, monospace',
      fontVariationSettings: "'MONO' 1, 'CASL' 0",
      fontSize: '12px',
      padding: '12px 0'
    },
    '.cm-gutters': { backgroundColor: 'transparent', color: '#575757', border: 'none' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#999999' },
    '.cm-cursor': { borderLeftColor: '#e6ad55' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(230,173,85,0.18)'
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(230,173,85,0.12)' },
    '.cm-panels': { backgroundColor: '#141414', color: '#cccccc' },
    '.cm-panel input, .cm-panel button': {
      backgroundColor: '#1c1c1c',
      color: '#cccccc',
      border: 'none',
      borderRadius: '4px',
      padding: '2px 6px'
    },
    '.cm-tooltip': {
      backgroundColor: '#212121',
      border: 'none',
      borderRadius: '6px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.45)'
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
      backgroundColor: '#383838',
      color: '#f2f2f2'
    },
    '.cm-completionLabel': {
      fontFamily: '"Recursive Variable", Consolas, monospace',
      fontVariationSettings: "'MONO' 1, 'CASL' 0"
    },
    '.cm-completionDetail': { color: '#757575', fontStyle: 'normal', marginLeft: '1rem' },
    '.cm-scroller': { overflow: 'auto' }
  },
  { dark: true }
)

const artemisHighlight = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#575757', fontStyle: 'italic' },
  { tag: [t.string, t.character], color: '#7fb069' },
  { tag: [t.number, t.bool, t.null], color: '#d0879b' },
  { tag: [t.keyword, t.modifier, t.operatorKeyword], color: '#e6ad55' },
  { tag: [t.typeName, t.className, t.namespace], color: '#6aaee8' },
  { tag: [t.annotation, t.meta], color: '#6aaee8' },
  { tag: [t.definition(t.variableName)], color: '#cccccc' },
  { tag: [t.propertyName], color: '#999999' }
])

const KIND_MAP: Record<CompletionItem['kind'], string> = {
  class: 'class',
  method: 'method',
  constant: 'constant',
  field: 'variable',
  snippet: 'text'
}

function completionSource(getItems: () => CompletionItem[]) {
  let indexed: CompletionItem[] | null = null
  let byOwner = new Map<string, CompletionItem[]>()
  let everything: CompletionItem[] = []

  const reindex = (): void => {
    const items = getItems()
    if (items === indexed) return
    indexed = items
    byOwner = new Map()
    const global: CompletionItem[] = []
    for (const item of items) {
      if (item.owner) {
        const list = byOwner.get(item.owner) ?? []
        list.push(item)
        byOwner.set(item.owner, list)
      } else {
        global.push(item)
      }
    }
    everything = [...global, ...[...byOwner.values()].flat()]
  }

  const toOption = (m: CompletionItem) => ({
    label: m.label,
    type: KIND_MAP[m.kind],
    detail: m.detail,
    info: m.info,
    apply: m.apply
  })

  return (ctx: CompletionContext): CompletionResult | null => {
    reindex()

    const dotted = ctx.matchBefore(/([A-Z][A-Za-z0-9_]*)\.\w*$/)
    if (dotted) {
      const owner = dotted.text.slice(0, dotted.text.indexOf('.'))
      const members = byOwner.get(owner)
      if (members) {
        return { from: dotted.from + owner.length + 1, options: members.map(toOption) }
      }
    }

    const word = ctx.matchBefore(/\w+/)
    if (!word || (word.from === word.to && !ctx.explicit)) return null
    return { from: word.from, options: everything.map(toOption) }
  }
}

export function CodeEditor(props: {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  className?: string
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChange = useRef(props.onChange)
  onChange.current = props.onChange

  const project = useProjectStore((s) => s.project)
  const completions = useMemo(() => (project ? buildCompletions(project) : []), [project])

  const completionsRef = useRef(completions)
  completionsRef.current = completions

  useEffect(() => {
    if (!host.current) return
    const extensions: Extension[] = [
      lineNumbers(),
      foldGutter(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      highlightSelectionMatches(),
      history(),
      search({ top: true }),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      java(),
      syntaxHighlighting(artemisHighlight),
      artemisTheme,
      autocompletion({
        override: [completionSource(() => completionsRef.current)],
        activateOnTyping: true
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab
      ]),
      EditorView.lineWrapping,
      EditorState.readOnly.of(!!props.readOnly),
      EditorView.editable.of(!props.readOnly),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChange.current?.(u.state.doc.toString())
      })
    ]

    const v = new EditorView({
      state: EditorState.create({ doc: props.value, extensions }),
      parent: host.current
    })
    view.current = v
    return () => {
      v.destroy()
      view.current = null
    }

  }, [props.readOnly])

  useEffect(() => {
    const v = view.current
    if (!v) return
    const current = v.state.doc.toString()
    if (current === props.value) return
    v.dispatch({ changes: { from: 0, to: current.length, insert: props.value } })
  }, [props.value])

  return <div ref={host} className={props.className} />
}
