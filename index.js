const fs = require('fs')
const esprima = require('esprima')
const _ = require('lodash')
const decamelize = require('decamelize')
const walk = require('walk')

const projectRoot = process.argv[2]
const excludedFolders = ['node_modules', 'coverage', 'tests']
const tokenTypes = [ 'Identifier' ]
const dropWords = ['']
const applyDecamelize = true

console.log(`scanning ${projectRoot}`)

new Promise((resolve, reject) => {
    const files = []
    const walker = walk.walk(projectRoot, { filters: excludedFolders})
    walker.on("file", (root, filestats, next) => {
        const name = filestats.name
        if (name.endsWith('.js')) {
            files.push(root + '/' + name)
        }
        next()
    })
    walker.on("errors", () => {
        reject(new Error("failed"))
    })
    walker.on("end", () => {
        resolve(files)
    })
}).then((files) => {
    let counts = _.chain(files)
        .map(file => {
            console.log('processing ' + file)
            const contents = fs.readFileSync(file, { encoding: 'UTF-8' })
            return _.chain(esprima.tokenize(contents))
                .filter(token => tokenTypes.includes(token.type))
                .map(token => token.value)
                .map(cameled => applyDecamelize ? decamelize(cameled, '_').split('_') : cameled)
                .flatMap()
                .filter((word) => !dropWords.includes(word))
                .countBy(word => word)
                .value()
        })
        .transform((acc, value) => {
            _.forEach(value, (count, text) => {
                acc[text] = acc[text] ? acc[text] + count : count
            })
        }, {})
        .toPairs()
        .map(([text, count]) => { return { text, count }})
        .value()
    fs.writeFileSync('./data.js', 
`function getData() {
    return ${JSON.stringify(counts, null, 2)}
}   
`)
}).catch((err) => {
    console.log(err)
})

