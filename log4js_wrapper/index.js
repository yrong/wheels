const path = require('path')
const fs = require('fs')
const log4js = require('log4js')
const config = require('config')
let logger_config

module.exports = {
    initialize: (options) => {
        const logDir = path.join('./logs')
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir)
        }
        log4js.configure(options, {cwd: logDir})
        logger_config = options
    },
    getLogger: (name,level) => {
        logger = log4js.getLogger(name||config.get('name'))
        logger.setLevel(level||logger_config.defaultLevel)
        return logger
    }
}
