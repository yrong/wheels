const path = require('path')
const fs = require('fs')
const log4js = require('log4js')
const config = require('config');
let logger

module.exports = {
    initialize: () => {
        const logger_config = config.get('logger')
        const logDir = path.join('./logs')
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir);
        }
        log4js.configure(logger_config, {cwd: logDir});
        logger = log4js.getLogger(config.get('name'))
        logger.setLevel(logger_config.defaultLevel)
    },
    getLogger: () => {
        return logger
    }
}
