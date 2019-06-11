const fs = require('fs')
const esprima = require('esprima')
const _ = require('lodash')
const decamelize = require('decamelize')
const walk = require('walk')
const chalk = require('chalk')

const optimist = require('optimist')
                .usage('Usage: $0 <projectroot> --decamel --tokens [array] --exlude [array] --drop [array]')

                .boolean(['decamel'])
                .default('decamel', true)
                .describe('decamel', 'Boolean - whether or not to break apart words by decamelizing them')

                .default('tokens', 'Identifier')
                .string('tokens')
                .describe('tokens', 'Array - token types to include in processing, supports all esprima token types')

                .default('exclude', 'node_modules,coverage,tests')
                .describe('exclude', 'Array - file and folder names to exlude')

                .default('drop', ',')
                .describe('drop', 'Array - words to drop')
                
const argv = optimist.argv

const projectRoot = argv._[0]
const excludedFolders = argv.exclude ? argv.exclude.split(',') : []
const tokenTypes = argv.tokens ? argv.tokens.split(',') : []
const dropWords = argv.drop ? argv.drop.split(','): []
const applyDecamelize = argv.decamel

if (argv.help) {
    optimist.showHelp()
    return
}

if (!projectRoot) {
    console.error(chalk.red('Missing project root'))
    optimist.showHelp()
    return
}

if (!fs.existsSync(projectRoot)) {
    console.error(chalk.red(`${projectRoot} does not exist`))
    return
}

console.log(`${chalk.yellow('Running with options:')}
    ${chalk.yellow('decamel:')}    ${chalk.blue(JSON.stringify(applyDecamelize))}
    ${chalk.yellow('tokens:')}     ${chalk.blue(JSON.stringify(tokenTypes))}
    ${chalk.yellow('drop:')}       ${chalk.blue(JSON.stringify(dropWords))}
    ${chalk.yellow('exclude:')}    ${chalk.blue(JSON.stringify(excludedFolders))}
`)

console.log(chalk.yellow(`scanning ${projectRoot}`))

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
            console.log(chalk.yellow('processing ') + chalk.green(file))
            const contents = fs.readFileSync(file, { encoding: 'UTF-8' })
            return _.chain(esprima.tokenize(contents))
                .filter(token => _.isEmpty(tokenTypes) || tokenTypes.includes(token.type))
                .map(token => token.value)
                .map(cameled => applyDecamelize ? decamelize(cameled, '_').split('_') : cameled)
                .flatMap()
                .filter((word) => _.isEmpty(dropWords) || !dropWords.includes(word))
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

