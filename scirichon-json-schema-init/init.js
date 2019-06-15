#!/usr/bin/env node

const init_schema = require('./index')

init_schema.initialize()
    .then((schemas) => {
        console.log("api server started")
    }).catch(err => console.log(err.stack || err))

process.on('uncaughtException', (err) => {
    logger.error(`Caught exception: ${err}`)
})
