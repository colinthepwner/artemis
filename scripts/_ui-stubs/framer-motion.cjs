const { createElement } = require('react')

const MOTION_PROPS = new Set([
  'initial',
  'animate',
  'exit',
  'transition',
  'variants',
  'whileHover',
  'whileTap',
  'whileFocus',
  'whileDrag',
  'whileInView',
  'layout',
  'layoutId',
  'layoutDependency',
  'drag',
  'dragConstraints',
  'dragElastic',
  'dragMomentum',
  'onDragEnd',
  'onDragStart',
  'onAnimationComplete',
  'custom',
  'viewport',
  'style'
])

function strip(props) {
  const out = {}
  for (const k of Object.keys(props || {})) {
    if (!MOTION_PROPS.has(k)) out[k] = props[k]
  }
  return out
}

const cache = new Map()
const motion = new Proxy(
  {},
  {
    get(_t, tag) {
      if (typeof tag !== 'string') return undefined
      if (!cache.has(tag)) {
        const C = (props) => createElement(tag, strip(props))
        C.displayName = `motion.${tag}`
        cache.set(tag, C)
      }
      return cache.get(tag)
    }
  }
)

const AnimatePresence = (props) => props.children ?? null
AnimatePresence.displayName = 'AnimatePresence'

const MotionConfig = (props) => props.children ?? null
MotionConfig.displayName = 'MotionConfig'

const LayoutGroup = (props) => props.children ?? null
LayoutGroup.displayName = 'LayoutGroup'

module.exports = {
  motion,
  AnimatePresence,
  MotionConfig,
  LayoutGroup,
  useReducedMotion: () => false,
  useAnimationControls: () => ({ start: () => Promise.resolve(), stop: () => {} }),
  useMotionValue: (v) => ({ get: () => v, set: () => {}, on: () => () => {} }),
  useTransform: (v) => v,
  useSpring: (v) => v
}
