# jira-summarizer

> Summarizes a list of Jira stories

## Install

Install it from GitHub via npm:

```bash
npm install -g github:rstacruz/jira-summarizer
```

This installs `jira-summarizer` in your global scope.

```bash
jira-summarizer --help
```

## Usage

Make a config.json file:

```bash
echo '{"domain":"YOURDOMAIN.atlassian.net"}' > config.json
```

Then pipe your `JIRA.csv` into it:

```bash
# Copy to clipboard (macOS)
jira-summarizer -c config.json < JIRA.csv | pbcopy

# ...or output to file
jira-summarizer -c config.json < JIRA.csv > my_report.md
```
