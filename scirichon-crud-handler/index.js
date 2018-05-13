const initialize  = require('scirichon-cache').initialize
const cypherInvoker = require('./cypher/cypherInvoker')
const hooks = require('./hooks')
const routes = require('./routes')
const batchHandler = require('./hooks/batchHandler')

module.exports = {cypherInvoker,initialize,hooks,routes,batchHandler}