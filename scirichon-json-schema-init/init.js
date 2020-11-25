#!/usr/bin/env node

require('dotenv').config()
const init = require('./index')

init.initialize()
    .then(async (schemas) => {
        process.exit(0)
    }).catch(err => console.log(err.stack || err))

process.on('uncaughtException', (err) => {
    console.error(`Caught exception: ${err}`)
})
