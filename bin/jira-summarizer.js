#!/usr/bin/env node
const parse = require('csv-parse')
const Transform = require('stream').Transform
const groupBy = require('group-by')
const resolve = require('path').resolve

/*
 * Meow
 */

const cli = require('meow')(
  `
  Usage:
    $ jira-summarizer < input.csv > output.md

  Options:
    -c, --config FILE    use this file

  Options:
    -h, --help           show usage information
    -v, --version        print version info and exit
`,
  {
    boolean: ['help', 'version'],
    string: ['config'],
    alias: {
      h: 'help',
      v: 'version',
      c: 'config'
    }
  }
)

/*
 * Flow types
 */

/*::
  export type Record = {
		// (eg, 'PROJECT-550')
	  'Issue key': string,

		// (eg, 'Implement some feature')
		'Summary': string,

		// Long description, CRLF
		'Description': string,

		// (eg, 'label1 label2')
		'Labels': string,

		// (eg, 'PROJECT-110' or '')
		'Custom field	(Epic Link)': string,

		'Priority': 'Lowest' | 'Low' | 'Medium' | 'High' | 'Highest',
		'Status': Status
	}

  export type Status = 'Open' | 'In Progress' | 'Rejected' | 'Closed'

  export type Records = Array<Record>

  export type GroupedRecords = {
    [string]: Records
  }

  export type Context = {
    CONFIG: Config
  }

  export type Config = {
    // (eg, 'foo.atlassian.net')
    domain: string,

    // (eg, `{ 'PR-23': 'Epic name', ... }`)
    epics: EpicList
  }

  export type EpicList = {
    [string]: string
  }

  export type CliOptions = {
    config?: string
  }
*/

/**
 * Defaults
 */

const DEFAULTS = {
  domain: 'DOMAIN.atlassian.net',
  epics: {}
}

/**
 * Status icons
 */

const STATUS_INDICES = {
  'Staging Ready': 2,
  Closed: 2,
  'Code Review': 1,
  'In Progress': 1,
  Rejected: 1,
  Open: 0
}

const STATUS_COLORS /*: { [string]: string } */ = {
  0: 'lightgrey',
  1: 'yellow',
  2: 'brightgreen'
}

/**
 * Priority annotations
 */

const PRIORITIES = {
  Highest: 2,
  High: 1,
  Medium: 0,
  Low: -1,
  Lowest: -2
}

/**
 * Runs it
 */

function run(opts /*: CliOptions */) {
  const parser = parse({
    delimiter: ',',
    columns: true,
    cast: true
  })

  const configPath = opts.config
  const userConfig = configPath
    ? require(resolve(process.cwd(), configPath))
    : {}
  const CONFIG /*: Config */ = { ...DEFAULTS, ...userConfig }

  process.stdin.pipe(parser).pipe(collect(render.bind(null, { CONFIG })))
}

/**
 * Renders to console.
 *
 * @example
 *     const records = [...]
 *     render(records)
 *     // Logs to console
 */

function render({ CONFIG } /*: Context */, records /*: Records */) /*: void */ {
  const groups /*: GroupRecords */ = groupBy(
    records,
    record => record['Custom field (Epic Link)']
  )

  const names /*: Array<string> */ = Object.keys(groups).sort()

  const EPICS = CONFIG.epics

  const msg = names
    .map((group /*: string */) => {
      const records /*: Records */ = groups[group]
      const epicName /*: string */ = EPICS[group] || group || 'No epic'

      return [`## ${epicName}`, renderGroup(records, { CONFIG })].join('\n\n')
    })
    .join('\n\n')

  console.log(`*Last updated on ${getTimestamp()}*\n\n`)
  console.log(msg)
}

/**
 * Renders a group of records
 */

function renderGroup(
  records /*: Records */,
  { CONFIG } /*: Context */
) /*: string */ {
  // Sort the records.
  const sortedRecords = records.sort(recordComparator)

  // Then render them one-by-one.
  const items = records.map((record /*: Record */) => {
    const key = record['Issue key']
    const priority = record['Priority']
    const title = record['Summary'].trim()
    const status = record['Status']
    const icon = toIcon(status)
    const desc = record['Description'].replace(/\r\n/g, '\n')
    const shortdesc = getShortDescription(desc)
    const domain = CONFIG.domain
    const url = `https://${domain}/browse/${key}`
    const suffix =
      PRIORITIES[priority] > 0
        ? ' :bangbang:'
        : PRIORITIES[priority] < 0 ? ' :arrow_down:' : ''

    return [
      `- [${icon}](${url}) &nbsp; ${title}${suffix}`,
      '',
      `  > ${shortdesc}`
    ].join('\n')
  })

  return items.join('\n\n')
}

/**
 * Sorts records. This function's used as a comparator for `Array.prototype.sort()`.
 */

function recordComparator(a /*: Record */, b /*: Record */) {
  const priority =
    (PRIORITIES[b['Priority']] || 0) - (PRIORITIES[a['Priority']] || 0)
  if (priority !== 0) return priority

  const statusIdx =
    (STATUS_INDICES[b['Status']] || 0) - (STATUS_INDICES[a['Status']] || 0)
  if (statusIdx !== 0) return statusIdx

  const statusName = a['Status'].localeCompare(b['Status'])
  if (statusName !== 0) return statusName

  return a['Summary'].localeCompare(b['Summary'])
}

/**
 * Return timestamp like `2018-09-02`
 *
 * @example
 *     getTimestamp()
 *     // => '2018-09-02'
 */

function getTimestamp() /*: string */ {
  return new Date().toISOString().replace(/T.*$/, '')
}

/**
 * Extracts the short description out of a long description
 *
 * @example
 *     getShortDescription('Makes waffles.\n\nThis thing is great for...')
 *     // => 'Makes waffles.'
 */

function getShortDescription(desc /*: string */) /*: string */ {
  return desc
    .replace(/\r\n/g, '\n')
    .split('\n')[0]
    .replace(/^_/, '')
    .replace(/_$/, '')
    .replace(/^Summary: /i, '')
    .replace(/^[A-Za-z]+'s summary: /i, '')
}

/**
 * Returns an icon from a status name
 */

function toIcon(status /*: Status | string */) /*: string */ {
  const index = STATUS_INDICES[status] || 0
  const color = STATUS_COLORS[index]
  const label = status.toLowerCase().replace(/ /g, '_')
  const url = `https://img.shields.io/badge/-${label}-${color}.svg`
  return `![${status}](${url})`
}

/**
 * A stream transformer; collect all records into an array, and invoke a
 * callback
 */

function collect(callback) {
  const records = []

  const xform = new Transform({
    objectMode: true,
    transform: (data, _, done) => {
      records.push(data)
      done(null)
    }
  })
  xform.on('finish', () => {
    callback(records)
  })

  return xform
}

/*
 * Run
 */

if (!module.parent) {
  run(cli.flags)
}
