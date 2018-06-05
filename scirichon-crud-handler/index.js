const initialize  = require('scirichon-cache').initialize
const cypherInvoker = require('./cypher/cypherInvoker')
const hooks = require('./hooks')
const batchHandler = require('./hooks/batchHandler')
const routes = require('./routes')
const middlewares = require('./middlewares')

module.exports = {cypherInvoker,initialize,hooks,routes,batchHandler,middlewares}