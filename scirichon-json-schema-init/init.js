#!/usr/bin/env node

const init = require('./index')

init.initialize()
    .then(async (schemas) => {
        process.exit(0)
    }).catch(err => console.log(err.stack || err))

process.on('uncaughtException', (err) => {
    logger.error(`Caught exception: ${err}`)
})
