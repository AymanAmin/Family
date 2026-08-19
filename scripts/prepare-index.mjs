import { readFile, writeFile } from 'node:fs/promises'

const template = await readFile('index.dev.html', 'utf8')
await writeFile('index.html', template, 'utf8')
console.log('Prepared index.html using the normal verified brand asset path.')
