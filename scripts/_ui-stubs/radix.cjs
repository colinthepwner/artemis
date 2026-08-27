const { createElement, Children } = require('react')

function passthrough(props) {
  return props?.children ?? null
}

function host(tag, extra) {
  const C = (props) => {
    const p = { ...props }
    delete p.asChild
    if (props?.asChild) {
      const only = Children.count(props.children) === 1 ? props.children : null
      if (only) return only
    }
    return createElement(tag, { ...p, ...(extra || {}) }, props?.children)
  }
  return C
}

const Root = (props) => createElement('div', { className: props?.className }, props?.children)

const SwitchRoot = (props) =>
  createElement(
    'button',
    {
      role: 'switch',
      'data-state': props?.checked ? 'checked' : 'unchecked',
      'aria-checked': Boolean(props?.checked),
      disabled: props?.disabled,
      className: props?.className,
      onClick: () => props?.onCheckedChange?.(!props?.checked)
    },
    props?.children
  )
SwitchRoot.displayName = 'Switch.Root'

const SliderRoot = (props) =>
  createElement(
    'div',
    {
      role: 'slider',
      'data-value': Array.isArray(props?.value) ? props.value[0] : props?.value,
      'data-min': props?.min,
      'data-max': props?.max,
      'data-step': props?.step,
      className: props?.className,
      onChange: (e) => props?.onValueChange?.([Number(e?.target?.value)])
    },
    props?.children
  )
SliderRoot.displayName = 'Slider.Root'

const MenuItem = (props) =>
  createElement(
    'div',
    {
      role: 'menuitem',
      className: props?.className,
      disabled: props?.disabled,
      onClick: () => props?.onSelect?.({ preventDefault() {} })
    },
    props?.children
  )
MenuItem.displayName = 'Menu.Item'

const MenuCheckboxItem = (props) => {
  const select = () => {
    props?.onSelect?.({ preventDefault() {} })
    props?.onCheckedChange?.(!props?.checked)
  }
  return createElement(
    'div',
    {
      role: 'menuitemcheckbox',
      'data-state': props?.checked ? 'checked' : 'unchecked',
      className: props?.className,
      onClick: select
    },
    props?.children
  )
}
MenuCheckboxItem.displayName = 'Menu.CheckboxItem'

module.exports = {

  Root,
  Portal: passthrough,
  Trigger: host('button'),
  Content: host('div', { role: 'menu' }),
  Item: MenuItem,
  CheckboxItem: MenuCheckboxItem,
  RadioGroup: host('div'),
  RadioItem: MenuItem,
  Label: host('div'),
  Separator: host('hr'),
  Group: host('div'),
  Sub: passthrough,
  SubTrigger: MenuItem,
  SubContent: host('div'),
  ItemIndicator: host('span'),
  Arrow: host('span'),
  Anchor: host('span'),

  Thumb: host('span'),

  Track: host('span'),
  Range: host('span'),

  SwitchRoot,
  SliderRoot
}
