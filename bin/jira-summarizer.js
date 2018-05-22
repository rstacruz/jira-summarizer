#!/usr/bin/env node
const parse = require('csv-parse')
const Transform = require('stream').Transform
const groupBy = require('group-by')

/*
 * Meow
 */

const cli = require('meow')(
  `
  Usage:
    $ jira-summarizer

  Options:
    -h, --help       show usage information
    -v, --version    print version info and exit
`,
  {
    boolean: ['help', 'version'],
    alias: {
      h: 'help',
      v: 'version'
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
*/

/**
 * Status icons
 */

const STATUS_COLORS = {
  'Staging Ready': 'brightgreen',
  Closed: 'brightgreen',
  'Code Review': 'yellow',
  'In Progress': 'yellow',
  Open: 'lightgrey',
  Rejected: 'yellow',
  Other: 'lightgrey'
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

function run() {
  const parser = parse({
    delimiter: ',',
    columns: true,
    cast: true
  })

  process.stdin.pipe(parser).pipe(collect(render))
}

/**
 * Renders to console.
 *
 * @example
 *     const records = [...]
 *     render(records)
 *     // Logs to console
 */

function render(records /*: Records */) /*: void */ {
  const CONFIG = require('../__config.json')

  const groups /*: GroupRecords */ = groupBy(
    records,
    record => record['Custom field (Epic Link)']
  )

  const names /*: Array<string> */ = Object.keys(groups).sort()

  const EPICS = CONFIG.epics

  const msg = names
    .map((group /*: string */) => {
      const records /*: Records */ = groups[group]
      const epicName /*: string */ = EPICS[group] || group

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
  const sortedRecords = records.sort((a, b) => {
    const idx =
      (PRIORITIES[b['Priority']] || 0) - (PRIORITIES[a['Priority']] || 0)
    if (idx !== 0) return idx
    return a['Summary'].localeCompare(b['Summary'])
  })

  const items = records.map((record /*: Record */) => {
    const key = record['Issue key']
    const priority = record['Priority']
    const title = record['Summary']
    const status = record['Status']
    const icon = toIcon(status)
    const desc = record['Description'].replace(/\r\n/g, '\n')
    const shortdesc = getShortDescription(desc)
    const domain = CONFIG.domain
    const url = `https://${domain}/browse/${key}`
    const label =
      PRIORITIES[priority] > 0
        ? `**${title.trim()}**`
        : PRIORITIES[priority] < 0 ? `*${title.trim()}*` : title

    return [`- [${icon}](${url}) &nbsp; ${label}`, '', `  > ${shortdesc}`].join(
      '\n'
    )
  })

  return items.join('\n\n')
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
  const color = STATUS_COLORS[status] || STATUS_COLORS.Other
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
  run()
}
