#!/usr/bin/env node
const parse = require('csv-parse')
const transform = require('stream-transform')
const Transform = require('stream').Transform
const groupBy = require('group-by')

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
 * Type
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
		'Priority': 'Low' | 'Medium' | 'High' | 'Highest',
		'Status': 'In Progress' | 'Rejected'
	}
*/

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

function render(records) {
  const CONFIG = require('../__config.json')
  const groups = groupBy(records, record => record['Custom field (Epic Link)'])
  const names = Object.keys(groups).sort()
  const EPICS = CONFIG.epics

  const msg = names
    .map(group => {
      const records = groups[group]
      const epicName = EPICS[group] || group
      return [`## ${epicName}`, '\n\n', renderGroup(records, { CONFIG })].join(
        ''
      )
    })
    .join('\n\n')

  const timestamp = new Date().toISOString().replace(/T.*$/, '')
  console.log(`*Last updated on ${timestamp}*\n\n`)
  console.log(msg)
}

function renderGroup(records, { CONFIG }) /*: string */ {
  const items = records.map(item => {
    const key = item['Issue key']
    const title = item['Summary']
    const status = item['Status']
    const icon = toIcon(status)
    const desc = item['Description'].replace(/\r\n/g, '\n')
    const shortdesc = desc
      .split('\n')[0]
      .replace(/^_/, '')
      .replace(/_$/, '')
      .replace(/^Summary: /i, '')
      .replace(/^[A-Za-z]+'s summary: /i, '')

    const domain = CONFIG.domain
    const url = `https://${domain}/browse/${key}`

    return [
      `- ${icon} ${title}`,
      `  > ${shortdesc} <br> [<kbd>${status}</kbd>](${url})`
    ].join('\n')
  })

  return items.join('\n\n')
}

const ICONS = {
  'Staging Ready': ':+1:',
  Closed: ':star:',
  'Code Review': ':+1:',
  'In Progress': ':hourglass:',
  Open: ':black_square_button:',
  Rejected: ':warning:',
  Other: ':grey_question:'
}

function toIcon(status) {
  return ICONS[status] || ICONS.Other
}

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
