import { createElement, type ReactElement, type ReactNode, type FunctionComponent } from 'react'
import * as React from 'react'

const internals = (React as any).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
if (!internals?.ReactCurrentDispatcher) {
  throw new Error('React internals moved: the probe cannot install its hook dispatcher')
}

const FRAGMENT = Symbol.for('react.fragment')
const PROVIDER = Symbol.for('react.provider')
const CONTEXT = Symbol.for('react.context')
const FORWARD_REF = Symbol.for('react.forward_ref')
const MEMO = Symbol.for('react.memo')

export interface ProbeNode {

  type: string
  props: Record<string, any>
  children: ProbeNode[]
  text?: string

  path: string
}

interface Hook {
  kind: string
  value: any
  deps?: unknown[] | undefined
  cleanup?: (() => void) | void
}

interface Instance {
  path: string
  hooks: Hook[]
  cursor: number

  seen: boolean
}

export interface ProbeRoot {

  tree: ProbeNode

  all: () => ProbeNode[]

  text: () => string
  find: (pred: (n: ProbeNode) => boolean) => ProbeNode | null
  findAll: (pred: (n: ProbeNode) => boolean) => ProbeNode[]

  byText: (s: string) => ProbeNode | null

  clickable: () => ProbeNode[]

  click: (n: ProbeNode, event?: Record<string, unknown>) => void

  contextMenu: (n: ProbeNode, event?: Record<string, unknown>) => void

  change: (n: ProbeNode, value: string | number | boolean) => void

  flush: () => void

  passes: number

  unmount: () => void
}

export function nodeText(n: ProbeNode): string {
  if (n.type === '#text') return n.text ?? ''
  return n.children.map(nodeText).join('')
}

export function renderProbe(element: ReactElement): ProbeRoot {
  const instances = new Map<string, Instance>()
  let dirty = false
  let current: Instance | null = null
  let effectQueue: Array<{ hook: Hook; fn: () => void | (() => void) }> = []

  const markDirty = (): void => {
    dirty = true
  }

  function nextHook(kind: string): Hook {
    const inst = current
    if (!inst) throw new Error(`hook "${kind}" called outside a component render`)
    let h = inst.hooks[inst.cursor]
    if (!h) {
      h = { kind, value: undefined }
      inst.hooks[inst.cursor] = h
    } else if (h.kind !== kind) {

      throw new Error(
        `hook order changed in ${inst.path}: slot ${inst.cursor} was ${h.kind}, now ${kind}`
      )
    }
    inst.cursor++
    return h
  }

  const depsChanged = (a: unknown[] | undefined, b: unknown[] | undefined): boolean => {
    if (!a || !b) return true
    if (a.length !== b.length) return true
    return a.some((v, i) => !Object.is(v, b[i]))
  }

  function useStateImpl(init: any): [any, (v: any) => void] {
    const h = nextHook('state') as Hook & { set?: (v: any) => void }
    if (!h.set) {
      h.value = typeof init === 'function' ? init() : init
      h.set = (v: any): void => {
        const next = typeof v === 'function' ? v(h.value) : v
        if (Object.is(next, h.value)) return
        h.value = next
        markDirty()
      }
    }
    return [h.value, h.set]
  }

  function useEffectImpl(fn: () => void | (() => void), deps?: unknown[]): void {
    const h = nextHook('effect')
    if (depsChanged(h.deps, deps)) {
      h.deps = deps
      effectQueue.push({ hook: h, fn })
    }
  }

  const readContext = (ctx: any): any => {
    const c = ctx?._context ?? ctx
    return c._currentValue
  }

  const dispatcher: Record<string, any> = {
    useState: useStateImpl,
    useReducer: (reducer: any, initArg: any, init?: any) => {
      const h = nextHook('reducer') as Hook & { dispatch?: (a: any) => void }
      if (!h.dispatch) {
        h.value = init ? init(initArg) : initArg
        h.dispatch = (action: any): void => {
          const next = reducer(h.value, action)
          if (Object.is(next, h.value)) return
          h.value = next
          markDirty()
        }
      }
      return [h.value, h.dispatch]
    },
    useEffect: useEffectImpl,
    useLayoutEffect: useEffectImpl,
    useInsertionEffect: useEffectImpl,
    useMemo: (fn: () => any, deps?: unknown[]) => {
      const h = nextHook('memo')
      if (depsChanged(h.deps, deps)) {
        h.deps = deps
        h.value = fn()
      }
      return h.value
    },
    useCallback: (fn: any, deps?: unknown[]) => {
      const h = nextHook('callback')
      if (depsChanged(h.deps, deps)) {
        h.deps = deps
        h.value = fn
      }
      return h.value
    },
    useRef: (init: any) => {
      const h = nextHook('ref')
      if (h.value === undefined) h.value = { current: init }
      return h.value
    },
    useContext: (ctx: any) => readContext(ctx),
    useDebugValue: () => undefined,
    useId: () => {
      const h = nextHook('id')
      if (h.value === undefined) h.value = `probe-id-${instances.size}`
      return h.value
    },
    useDeferredValue: (v: any) => v,
    useTransition: () => [false, (fn: () => void) => fn()],
    useImperativeHandle: () => undefined,

    useSyncExternalStore: (subscribe: any, getSnapshot: any) => {
      const h = nextHook('sync')
      if (!h.cleanup) h.cleanup = subscribe(markDirty)
      return getSnapshot()
    }
  }

  function renderChildren(children: ReactNode, path: string, out: ProbeNode[]): void {
    if (children === null || children === undefined || typeof children === 'boolean') return
    if (Array.isArray(children)) {
      children.forEach((c, i) => renderChildren(c, `${path}[${i}]`, out))
      return
    }
    if (typeof children === 'string' || typeof children === 'number') {
      out.push({ type: '#text', props: {}, children: [], text: String(children), path })
      return
    }
    renderElement(children as ReactElement, path, out)
  }

  function renderElement(el: ReactElement, path: string, out: ProbeNode[]): void {
    if (!el || typeof el !== 'object') return
    const type: any = (el as any).type
    const props: any = (el as any).props ?? {}
    const key = (el as any).key
    const at = key === null || key === undefined ? path : `${path}#${key}`

    if (type === FRAGMENT || type === undefined) {
      renderChildren(props.children, `${at}.f`, out)
      return
    }
    if (typeof type === 'string') {
      const node: ProbeNode = { type, props, children: [], path: at }
      renderChildren(props.children, `${at}.${type}`, node.children)
      out.push(node)
      return
    }
    if (typeof type === 'object' && type !== null) {
      const tag = type.$$typeof
      if (tag === PROVIDER) {

        const ctx = type._context ?? type
        const prev = ctx._currentValue
        ctx._currentValue = props.value
        renderChildren(props.children, `${at}.p`, out)
        ctx._currentValue = prev
        return
      }
      if (tag === CONTEXT) {
        renderChildren((props.children as any)(readContext(type)), `${at}.c`, out)
        return
      }
      if (tag === FORWARD_REF) {
        runComponent(
          (p: any) => type.render(p, (el as any).ref ?? null),
          props,
          `${at}.${type.displayName ?? 'ForwardRef'}`,
          out
        )
        return
      }
      if (tag === MEMO) {
        renderElement({ ...(el as any), type: type.type } as ReactElement, `${at}.m`, out)
        return
      }
    }
    if (typeof type === 'function') {
      const name = type.displayName ?? type.name ?? 'Anonymous'

      if (type.prototype?.isReactComponent) {
        throw new Error(`${name} is a class component and the probe only runs function components`)
      }
      runComponent(type as FunctionComponent, props, `${at}.${name}`, out)
      return
    }
    throw new Error(`probe cannot render element type ${String(type)} at ${at}`)
  }

  function runComponent(
    fn: (p: any) => ReactNode,
    props: any,
    path: string,
    out: ProbeNode[]
  ): void {
    let inst = instances.get(path)
    if (!inst) {
      inst = { path, hooks: [], cursor: 0, seen: true }
      instances.set(path, inst)
    }
    inst.seen = true
    inst.cursor = 0
    const prev = current
    current = inst
    let result: ReactNode
    try {
      result = fn(props)
    } finally {
      current = prev
    }
    renderChildren(result, path, out)
  }

  let tree: ProbeNode = { type: '#root', props: {}, children: [], path: '' }

  function onePass(): void {
    for (const inst of instances.values()) inst.seen = false
    effectQueue = []
    const out: ProbeNode[] = []
    const prevDispatcher = internals.ReactCurrentDispatcher.current
    internals.ReactCurrentDispatcher.current = dispatcher
    try {
      renderElement(element, 'root', out)
    } finally {
      internals.ReactCurrentDispatcher.current = prevDispatcher
    }
    tree = { type: '#root', props: {}, children: out, path: '' }

    for (const [path, inst] of [...instances.entries()]) {
      if (inst.seen) continue
      for (const hk of inst.hooks) {
        if (typeof hk.cleanup === 'function') hk.cleanup()
      }
      instances.delete(path)
    }

    const queue = effectQueue
    effectQueue = []
    for (const e of queue) {
      if (typeof e.hook.cleanup === 'function') e.hook.cleanup()
      e.hook.cleanup = e.fn()
    }
  }

  function flush(): void {
    let passes = 0
    dirty = true
    while (dirty) {
      if (passes > 40) {
        throw new Error('probe render did not settle in 40 passes: a component is looping')
      }
      dirty = false
      onePass()
      passes++
    }
    root.tree = tree
    root.passes = passes
  }

  const walk = (n: ProbeNode, out: ProbeNode[]): void => {
    if (n.type !== '#root') out.push(n)
    for (const c of n.children) walk(c, out)
  }

  const root: ProbeRoot = {
    tree,
    passes: 0,
    all: () => {
      const out: ProbeNode[] = []
      walk(root.tree, out)
      return out
    },
    text: () => nodeText(root.tree),
    find: (pred) => root.all().find(pred) ?? null,
    findAll: (pred) => root.all().filter(pred),
    byText: (s) => root.all().find((n) => n.type !== '#text' && nodeText(n).includes(s)) ?? null,
    clickable: () => root.all().filter((n) => typeof n.props.onClick === 'function'),
    click: (n, event) => {
      const handler = n.props.onClick
      if (typeof handler !== 'function') {
        throw new Error(`node <${n.type}> at ${n.path} has no onClick`)
      }
      handler({
        preventDefault(): void {},
        stopPropagation(): void {},
        currentTarget: n,
        target: n,
        ...(event ?? {})
      })
      flush()
    },
    contextMenu: (n, event) => {
      const handler = n.props.onContextMenu
      if (typeof handler !== 'function') {
        throw new Error(`node <${n.type}> at ${n.path} has no onContextMenu`)
      }
      handler({
        preventDefault(): void {},
        stopPropagation(): void {},
        currentTarget: n,
        target: n,
        ...(event ?? {})
      })
      flush()
    },
    change: (n, value) => {
      const handler = n.props.onChange
      if (typeof handler !== 'function') {
        throw new Error(`node <${n.type}> at ${n.path} has no onChange`)
      }
      const target = { value: String(value), checked: value === true }
      handler({
        target,
        currentTarget: target,
        preventDefault(): void {},
        stopPropagation(): void {}
      })
      flush()
    },
    flush,
    unmount: () => {
      for (const inst of instances.values()) {
        for (const hk of inst.hooks) if (typeof hk.cleanup === 'function') hk.cleanup()
      }
      instances.clear()
    }
  }

  flush()
  return root
}

export const h = createElement
