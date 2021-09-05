import { defaultColumn, emptyRenderer } from './publicUtils'

// Find the depth of the columns
export function findMaxDepth(columns, depth = 0) {
  return columns.reduce((prev, curr) => {
    // case where a column has columns property
    if (curr.columns) {
      return Math.max(prev, findMaxDepth(curr.columns, depth + 1))
    }
    return depth
  }, 0)
}

// deep flatten an array
function flattenDeep(arr, newArr = []) {
  if (!Array.isArray(arr)) {
    newArr.push(arr)
  } else {
    for (let i = 0; i < arr.length; i += 1) {
      flattenDeep(arr[i], newArr)
    }
  }
  return newArr
}

const reOpenBracket = /\[/g
const reCloseBracket = /\]/g

function makePathArray(obj) {
  return (
    flattenDeep(obj)
      // remove all periods in parts
      .map(d => String(d).replace('.', '_'))
      // join parts using period
      .join('.')
      // replace brackets with periods
      .replace(reOpenBracket, '.')
      .replace(reCloseBracket, '')
      // split it back out on periods
      .split('.')
  )
}

export function getBy(obj, path, def) {
  if (!path) {
    return obj
  }
  const cacheKey = typeof path === 'function' ? path : JSON.stringify(path)

  const pathObj =
    pathObjCache.get(cacheKey) ||
    (() => {
      // IIFE avoids polluting *pathObj* variable name
      const pathObj = makePathArray(path)
      pathObjCache.set(cacheKey, pathObj)
      return pathObj
    })()

  let val

  try {
    // obj is initial value for *cursor*
    val = pathObj.reduce((cursor, pathPart) => cursor[pathPart], obj)
  } catch (e) {
    // continue regardless of error
  }
  return typeof val !== 'undefined' ? val : def
}

export function getFirstDefined(...args) {
  for (let i = 0; i < args.length; i += 1) {
    if (typeof args[i] !== 'undefined') {
      return args[i]
    }
  }
}

export function assignColumnAccessor(column) {
  /* example columns
      {
        Header: 'Order Date',
        id: 'date',
        accessor: d => new Date(d.date),
        sortType: 'basic',
        aggregate: 'count',
        Cell: ({ value }) => (value ? dayjs(value).format('l') : ''),
        Aggregated: ({ value }) => `${value} Orders`,
      },
      {
        Header: 'Employee',
        accessor: 'rep',
        aggregate: 'uniqueCount',
      },
    */

  // First check for string accessor
  let { id, accessor, Header } = column

  if (typeof accessor === 'string') {
    // if no id is specified, then treat accessor as id
    id = id || accessor
    // returns an array like ["some"] or ["some", "some2"]
    const accessorPath = accessor.split('.')
    // assign accessor to a fn which takes row as an arg
    accessor = row => getBy(row, accessorPath)
  }

  // if accessor is not a string, then id is set to Header
  if (!id && typeof Header === 'string' && Header) {
    id = Header
  }

  if (!id && column.columns) {
    console.error(column)
    throw new Error('A column ID (or unique "Header" value) is required!')
  }

  if (!id) {
    console.error(column)
    throw new Error('A column ID (or string accessor) is required!')
  }

  Object.assign(column, {
    id,
    accessor,
  })

  return column
}

// Build the visible columns, headers and flat column list
export function linkColumnStructure(columns, parent, depth = 0) {
  return columns.map(column => {
    column = {
      ...column,
      parent,
      depth,
    }

    assignColumnAccessor(column)

    if (column.columns) {
      column.columns = linkColumnStructure(column.columns, column, depth + 1)
    }
    return column
  })
}

export function flattenColumns(columns) {
  return flattenBy(columns, 'columns')
}

export function decorateColumn(column, userDefaultColumn) {
  if (!userDefaultColumn) {
    throw new Error()
  }
  Object.assign(column, {
    // Make sure there is a fallback header, just in case
    Header: emptyRenderer,
    Footer: emptyRenderer,
    ...defaultColumn,
    ...userDefaultColumn,
    ...column,
  })

  Object.assign(column, {
    originalWidth: column.width,
  })

  return column
}

// inputs: allColumns, defaultColumn, additionalHeaderProperties
// output: headerGroups
// Build the header groups from the bottom up
export function makeHeaderGroups(
  allColumns,
  defaultColumn,
  additionalHeaderProperties = () => ({})
) {
  const headerGroups = []

  // scanColumns and allColumns hold reference to exactly the same array
  // when scanColumns is later assigned to parentColumns, the reference that scanColumns holds changes
  let scanColumns = allColumns

  let uid = 0
  const getUID = () => uid++

  while (scanColumns.length) {
    // inside the while loop, outside the forEach
    // The header group we are creating
    const headerGroup = {
      headers: [],
    }

    // The parent columns we're going to scan next
    const parentColumns = []

    // initially checked for each *allColumns* column in the forEach loop
    // after that it is checked for each *parentColumns* column
    const hasParents = scanColumns.some(d => d.parent)

    // Scan each column for parents
    scanColumns.forEach(column => {
      // What is the latest (last) parent column?
      let latestParentColumn = [...parentColumns].reverse()[0]

      let newParent

      if (hasParents) {
        // If the column has a parent, add it if necessary
        if (column.parent) {
          newParent = {
            ...column.parent,
            originalId: column.parent.id,
            id: `${column.parent.id}_${getUID()}`,
            headers: [column],
            ...additionalHeaderProperties(column),
          }
        } else {
          // If other columns have parents, we'll need to add a place holder if necessary
          newParent = decorateColumn(
            {
              originalId: `${column.id}_placeholder`,
              id: `${column.id}_placeholder_${getUID()}`,
              placeholderOf: column,
              headers: [column],
              ...additionalHeaderProperties(column),
            },
            defaultColumn
          )
        }

        // If the resulting parent columns are the same, just add
        // the column and increment the header span
        if (
          latestParentColumn &&
          latestParentColumn.originalId === newParent.originalId
        ) {
          latestParentColumn.headers.push(column)
        } else {
          parentColumns.push(newParent)
        }
      }

      headerGroup.headers.push(column)
    })

    headerGroups.push(headerGroup)

    // Start scanning the parent columns
    scanColumns = parentColumns
  }

  return headerGroups.reverse()
}

// The Map object holds key-value pairs and remembers the original insertion order of the keys.
const pathObjCache = new Map()

export function getElementDimensions(element) {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  const margins = {
    left: parseInt(style.marginLeft),
    right: parseInt(style.marginRight),
  }
  const padding = {
    left: parseInt(style.paddingLeft),
    right: parseInt(style.paddingRight),
  }
  return {
    left: Math.ceil(rect.left),
    width: Math.ceil(rect.width),
    outerWidth: Math.ceil(
      rect.width + margins.left + margins.right + padding.left + padding.right
    ),
    marginLeft: margins.left,
    marginRight: margins.right,
    paddingLeft: padding.left,
    paddingRight: padding.right,
    scrollWidth: element.scrollWidth,
  }
}

export function isFunction(a) {
  if (typeof a === 'function') {
    return a
  }
}

export function flattenBy(arr, key) {
  const flat = []

  const recurse = arr => {
    arr.forEach(d => {
      if (!d[key]) {
        flat.push(d)
      } else {
        recurse(d[key])
      }
    })
  }

  recurse(arr)

  return flat
}

export function expandRows(
  rows,
  { manualExpandedKey, expanded, expandSubRows = true }
) {
  const expandedRows = []

  const handleRow = (row, addToExpandedRows = true) => {
    row.isExpanded =
      (row.original && row.original[manualExpandedKey]) || expanded[row.id]

    row.canExpand = row.subRows && !!row.subRows.length

    if (addToExpandedRows) {
      expandedRows.push(row)
    }

    if (row.subRows && row.subRows.length && row.isExpanded) {
      row.subRows.forEach(row => handleRow(row, expandSubRows))
    }
  }

  rows.forEach(row => handleRow(row))

  return expandedRows
}

export function getFilterMethod(filter, userFilterTypes, filterTypes) {
  return (
    isFunction(filter) ||
    userFilterTypes[filter] ||
    filterTypes[filter] ||
    filterTypes.text
  )
}

export function shouldAutoRemoveFilter(autoRemove, value, column) {
  return autoRemove ? autoRemove(value, column) : typeof value === 'undefined'
}

export function unpreparedAccessWarning() {
  throw new Error(
    'React-Table: You have not called prepareRow(row) one or more rows you are attempting to render.'
  )
}

let passiveSupported = null
export function passiveEventSupported() {
  // memoize support to avoid adding multiple test events
  if (typeof passiveSupported === 'boolean') return passiveSupported

  let supported = false
  try {
    const options = {
      get passive() {
        supported = true
        return false
      },
    }

    window.addEventListener('test', null, options)
    window.removeEventListener('test', null, options)
  } catch (err) {
    supported = false
  }
  passiveSupported = supported
  return passiveSupported
}

//
