import React from 'react'

let renderErr = 'Renderer Error ☝️'

export const actions = {
  init: 'init',
}

export const defaultRenderer = ({ value = '' }) => value
// non-breaking space (does not cause a new line)
export const emptyRenderer = () => <>&nbsp;</>

export const defaultColumn = {
  Cell: defaultRenderer,
  width: 150,
  minWidth: 0,
  maxWidth: Number.MAX_SAFE_INTEGER,
}

// style and className props are merged with existing corresponding props of the same name
// other props are appended to existing props object
function mergeProps(...propList) {
  return propList.reduce((props, next) => {
    const { style, className, ...rest } = next

    props = {
      ...props,
      ...rest,
    }

    if (style) {
      props.style = props.style
        ? { ...(props.style || {}), ...(style || {}) }
        : style
    }

    if (className) {
      props.className = props.className
        ? props.className + ' ' + className
        : className
    }

    if (props.className === '') {
      delete props.className
    }

    return props
  }, {})
}

// depending on whether userProps is fn, array or object, merge it with prevProps
function handlePropGetter(prevProps, userProps, meta) {
  // Handle a lambda, pass it the previous props
  if (typeof userProps === 'function') {
    return handlePropGetter({}, userProps(prevProps, meta))
  }

  // Handle an array, merge each item as separate props
  if (Array.isArray(userProps)) {
    return mergeProps(prevProps, ...userProps)
  }

  // Handle an object by default, merge the two objects
  return mergeProps(prevProps, userProps)
}

// returns a fn which encloses *hooks* and *meta*
// returned fn accepts *userProps* arg
// calls *handlePropGetter* on each hook and userProp for merging
export const makePropGetter = (hooks, meta = {}) => {
  return (userProps = {}) =>
    [...hooks, userProps].reduce(
      (prev, next) =>
        handlePropGetter(prev, next, {
          ...meta,
          userProps,
        }),
      {}
    )
}

// takes all fns in *hooks* and an *initial* fn and invokes each fn one by one
export const reduceHooks = (hooks, initial, meta = {}, allowUndefined) =>
  hooks.reduce((prev, next) => {
    // prev is accumulator
    // *hooks* arg in outer reduceHooks fn contain fns, next is one of them
    // next uses prev as its first arg
    // initial value of prev is *initial* arg passed to the outer reduceHooks fn
    // next uses meta as its first arg
    // meta is *meta* arg passed to the outer reduceHooks fn
    // this means every hook is expecting two args: prev and meta
    const nextValue = next(prev, meta)
    if (process.env.NODE_ENV !== 'production') {
      if (!allowUndefined && typeof nextValue === 'undefined') {
        console.info(next)
        throw new Error(
          'React Table: A reducer hook ☝️ just returned undefined! This is not allowed.'
        )
      }
    }
    // in reduce fn, the return value in each iteration is assigned to the acc (*prev* in this case)
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce#how_reduce_works
    // in the iteration, each hook fn is invoked with *prev* as their first arg
    // the result of the final hook fn is returned after all iterations
    return nextValue
  }, initial)

// ensures that any fn in *hooks* does not return a value
export const loopHooks = (hooks, context, meta = {}) =>
  // forEach() does not mutate the array on which it is called. (However, callbackFn may do so)
  // map() returns a new array while forEach() doesn't.
  // forEach() just operates on every value in the array.
  hooks.forEach(hook => {
    const nextValue = hook(context, meta)
    if (process.env.NODE_ENV !== 'production') {
      if (typeof nextValue !== 'undefined') {
        console.info(hook, nextValue)
        throw new Error(
          'React Table: A loop-type hook ☝️ just returned a value! This is not allowed.'
        )
      }
    }
  })

// ensures index of plugin with name pluginName in *plugins* is greater than index of plugins in *befores*
export function ensurePluginOrder(plugins, befores, pluginName, afters) {
  if (process.env.NODE_ENV !== 'production' && afters) {
    throw new Error(
      `Defining plugins in the "after" section of ensurePluginOrder is no longer supported (see plugin ${pluginName})`
    )
  }
  const pluginIndex = plugins.findIndex(
    plugin => plugin.pluginName === pluginName
  )

  if (pluginIndex === -1) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`The plugin "${pluginName}" was not found in the plugin list!
This usually means you need to need to name your plugin hook by setting the 'pluginName' property of the hook function, eg:

  ${pluginName}.pluginName = '${pluginName}'
`)
    }
  }

  befores.forEach(before => {
    const beforeIndex = plugins.findIndex(
      plugin => plugin.pluginName === before
    )
    if (beforeIndex > -1 && beforeIndex > pluginIndex) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `React Table: The ${pluginName} plugin hook must be placed after the ${before} plugin hook!`
        )
      }
    }
  })
}

// return first arg if it is not a fn else return the result of invoking first arg with second arg
export function functionalUpdate(updater, old) {
  return typeof updater === 'function' ? updater(old) : updater
}

/*
https://github.com/tannerlinsley/react-table/blob/master/CHANGELOG.md
Converted almost all usages of instanceRef.current
to use useGetLatest(instanceRef.current)
to help with avoiding memory leaks and to be more terse.

https://spectrum.chat/react-table/general/v7-can-some-one-explain-usegetlatest-instanceref-current~54763a00-66ae-4211-bb35-52ca25686546?m=MTU3NjM0NDg0ODczNA==
Instead of using instanceRef.current all over the place,
you just use getInstance()

which just looks better imo

less clutter

as for memory leaks, it’s not the getLatest implementation that does this.
It’s just the fact that it’s used at all as opposed to creating closures around instanceRef.current
*/
export function useGetLatest(obj) {
  const ref = React.useRef()
  ref.current = obj

  return React.useCallback(() => ref.current, [])
}

// SSR has issues with useLayoutEffect still, so use useEffect during SSR
export const safeUseLayoutEffect =
  // check for document means check for browser or such client
  typeof document !== 'undefined' ? React.useLayoutEffect : React.useEffect

export function useMountedLayoutEffect(fn, deps) {
  const mountedRef = React.useRef(false)

  // fn defined above, not a React hook
  safeUseLayoutEffect(
    // the below callback and deps are passed to useEffect (or useLayoutEffect)
    () => {
      if (mountedRef.current) {
        fn()
      }
      mountedRef.current = true
      // eslint-disable-next-line
    },
    // if the deps change,
    // the callback fn will be invoked
    // mountedRef.current value will be checked
    // and accordingly, fn will execute or not
    // mountedRef.current value will be set to true
    deps
  )
}

// This is a general (not specific to React Table) fn for using async debounce using hooks and promise
// it returns a function which takes any args and returns a promise
// promise is related to the arg (defaultFn) passed to this (useAsyncDebounce) fn
// however the args to defaultFn are passed when the fn returned by *useAsyncDebounce* is invoked
export function useAsyncDebounce(defaultFn, defaultWait = 0) {
  const debounceRef = React.useRef({})

  // the reference to defaultFn and defaultWait will change whenever useAsyncDebounce is invoked,
  // so we use refs to save the defaultFn and defaultWait
  const getDefaultFn = useGetLatest(defaultFn)
  const getDefaultWait = useGetLatest(defaultWait)

  return React.useCallback(
    // these args are the args passed to the fn returned on invoking *useAsyncDebounce*
    async (...args) => {
      if (!debounceRef.current.promise) {
        debounceRef.current.promise = new Promise((resolve, reject) => {
          debounceRef.current.resolve = resolve
          debounceRef.current.reject = reject
        })
      }

      if (debounceRef.current.timeout) {
        clearTimeout(debounceRef.current.timeout)
      }

      debounceRef.current.timeout = setTimeout(async () => {
        delete debounceRef.current.timeout
        try {
          // fn returned by getDefaultFn is called with args
          // these args are passed into the fn returned as the result of useAsyncDebounce
          debounceRef.current.resolve(await getDefaultFn()(...args))
        } catch (err) {
          debounceRef.current.reject(err)
        } finally {
          delete debounceRef.current.promise
        }
      }, getDefaultWait())

      // think of *getDefaultFn* as a fetchData fn which will call an API and dispatch actions when promise is resolved
      // https://spectrum.chat/react-table/general/manual-pagination-useasyncdebounce-fn-not-a-function~9d8536ac-abc4-435a-9d53-f351a046bdac
      return debounceRef.current.promise
    },
    [getDefaultFn, getDefaultWait]
  )
}

// returns a fn (which encloses instance, column and meta) which will take args (type and userProps) and return a component
export function makeRenderer(instance, column, meta = {}) {
  return (type, userProps = {}) => {
    const Comp = typeof type === 'string' ? column[type] : type

    if (typeof Comp === 'undefined') {
      console.info(column)
      throw new Error(renderErr)
    }

    return flexRender(Comp, { ...instance, column, ...meta, ...userProps })
  }
}

export function flexRender(Comp, props) {
  return isReactComponent(Comp) ? <Comp {...props} /> : Comp
}

function isReactComponent(component) {
  return (
    isClassComponent(component) ||
    typeof component === 'function' ||
    isExoticComponent(component)
  )
}

function isClassComponent(component) {
  return (
    typeof component === 'function' &&
    (() => {
      const proto = Object.getPrototypeOf(component)
      return proto.prototype && proto.prototype.isReactComponent
    })()
  )
}

function isExoticComponent(component) {
  return (
    typeof component === 'object' &&
    typeof component.$$typeof === 'symbol' &&
    ['react.memo', 'react.forward_ref'].includes(component.$$typeof.description)
  )
}
