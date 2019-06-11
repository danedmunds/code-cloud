const fs = require('fs')
const esprima = require('esprima')
const _ = require('lodash')
const decamelize = require('decamelize')
const walk = require('walk')
const chalk = require('chalk')

const optimist = require('optimist')
    .usage('Usage: $0 <projectroot> --decamel --tokens [array] --exlude [array] --drop [array]')

    .boolean('decamel')
    .default('decamel', true)
    .describe('decamel', 'Boolean - whether or not to break apart words by decamelizing them')

    .boolean('split')
    .default('split', true)
    .describe('split', 'Boolean - whether or not to break apart words by spliting them on whitespace')

    .describe('split-regex', 'RegExp - regex to split words on, good for dropping non-ascii characters')

    .default('tokens', 'Identifier')
    .string('tokens')
    .describe('tokens', 'Array - token types to include in processing, supports all esprima token types, ones I know about: Keyword, Identifier, Punctuator, String, Numeric, Boolean, Template, Null, RegularExpression')

    .default('exclude-folders', 'node_modules,coverage,tests')
    .describe('exclude-folders', 'Array - folder names to exlude')

    .describe('exclude-files', 'Array - file names to exclude')

    .describe('drop', 'Array - words to drop')

    .boolean('save-analysis')
    .default('save-analysis', false)
    .describe('save-analysis', 'Boolean - Whether or not to save the analysis into output.csv')
                
const argv = optimist.argv

const projectRoot = argv._[0]
const excludedFolders = argv['exclude-folders'] ? argv['exclude-folders'].split(',') : []
const excludedFiles = argv['exclude-files'] ? argv['exclude-files'].split(',') : []
const tokenTypes = argv.tokens ? argv.tokens.split(',') : []
const dropWords = argv.drop ? argv.drop.split(','): []
const applyDecamelize = argv.decamel
const splitStrings = argv.split
const splitRegex = argv['split-regex'] ? new RegExp(argv['split-regex']) : null
const saveAnalysis = argv['save-analysis']

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
    ${chalk.cyan('decamel:')}           ${chalk.blue(JSON.stringify(applyDecamelize))}
    ${chalk.cyan('tokens:')}            ${chalk.blue(JSON.stringify(tokenTypes))}
    ${chalk.cyan('drop:')}              ${chalk.blue(JSON.stringify(dropWords))}
    ${chalk.cyan('exclude-folders:')}   ${chalk.blue(JSON.stringify(excludedFolders))}
    ${chalk.cyan('exclude-files:')}     ${chalk.blue(JSON.stringify(excludedFiles))}
    ${chalk.cyan('split-regex:')}       ${chalk.blue(splitRegex ? splitRegex.toString() : null)}
    ${chalk.cyan('save-analysis:')}     ${chalk.blue(JSON.stringify(saveAnalysis))}
`)

console.log(chalk.yellow(`scanning ${projectRoot}`))

new Promise((resolve, reject) => {
    const files = []
    const walker = walk.walk(projectRoot, { filters: excludedFolders})
    walker.on("file", (root, filestats, next) => {
        const name = filestats.name
        if (name.endsWith('.js') && !excludedFiles.includes(name)) {
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
                // filter requested token types
                .filter(token =>  _.isEmpty(tokenTypes) || tokenTypes.includes(token.type))
                // get the token value
                .map(token => token.value)
                // split camelcase
                .map(cameled => applyDecamelize ? decamelize(cameled, '_').split('_') : cameled).flatMap()
                // split by whitespace
                .map(word => splitStrings ? word.split(/\s/) : word).flatMap()
                // split by regex
                .map(word => splitRegex ? word.split(splitRegex) : word).flatMap()
                // drop the words to not include
                .filter((word) => word != '' && (_.isEmpty(dropWords) || !dropWords.includes(word)))
                // count
                .countBy(word => word)
                .value()
        })
        // combine the analyses
        .transform((acc, value) => {
            _.forEach(value, (count, text) => {
                acc[text] = acc[text] ? acc[text] + count : count
            })
        }, {})
        // split into key-value pairs
        .toPairs()
        // render into objects
        .map(([text, count]) => { return { text, count }})
        .value()
    if (saveAnalysis) {
        let blah = ''
        counts.forEach((row) => {
            blah += `${row.text},${row.count}\n`
        })
        fs.writeFileSync('./output.csv', blah)
    }
    fs.writeFileSync('./data.js', 
`function getData() {
    return ${JSON.stringify(counts, null, 2)}
}   
`)
}).catch((err) => {
    console.log(err)
})

