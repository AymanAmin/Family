import { copyFile } from 'node:fs/promises'

await copyFile('index.dev.html', 'index.html')
console.log('Prepared index.html from index.dev.html')
